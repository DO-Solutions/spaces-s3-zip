import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import archiver from 'archiver';
import { Readable, PassThrough } from 'stream';

/**
 * DigitalOcean Function to backup a Spaces bucket to another bucket
 * This function downloads all objects from a source bucket, archives them,
 * and uploads the archive to a destination bucket
 */
async function main(args) {
  const startTime = Date.now();

  // Extract environment variables
  const {
    SOURCE_BUCKET,
    SOURCE_REGION = 'nyc3',
    SOURCE_ENDPOINT,
    DEST_BUCKET,
    DEST_REGION = 'nyc3',
    DEST_ENDPOINT,
    SPACES_KEY,
    SPACES_SECRET,
    ARCHIVE_PREFIX = 'backups'
  } = process.env;

  // Validate required environment variables
  if (!SOURCE_BUCKET || !DEST_BUCKET || !SPACES_KEY || !SPACES_SECRET) {
    return {
      statusCode: 400,
      body: {
        error: 'Missing required environment variables',
        required: ['SOURCE_BUCKET', 'DEST_BUCKET', 'SPACES_KEY', 'SPACES_SECRET']
      }
    };
  }

  try {
    console.log(`Starting backup of bucket: ${SOURCE_BUCKET}`);

    // Create S3 clients for source and destination
    const sourceClient = new S3Client({
      endpoint: SOURCE_ENDPOINT || `https://${SOURCE_REGION}.digitaloceanspaces.com`,
      region: SOURCE_REGION,
      credentials: {
        accessKeyId: SPACES_KEY,
        secretAccessKey: SPACES_SECRET
      },
      forcePathStyle: false
    });

    const destClient = new S3Client({
      endpoint: DEST_ENDPOINT || `https://${DEST_REGION}.digitaloceanspaces.com`,
      region: DEST_REGION,
      credentials: {
        accessKeyId: SPACES_KEY,
        secretAccessKey: SPACES_SECRET
      },
      forcePathStyle: false
    });

    // List all objects in the source bucket
    const objects = await listAllObjects(sourceClient, SOURCE_BUCKET);
    console.log(`Found ${objects.length} objects to backup`);

    if (objects.length === 0) {
      return {
        statusCode: 200,
        body: {
          message: 'No objects found in source bucket',
          bucket: SOURCE_BUCKET
        }
      };
    }

    // Create archive and upload to destination
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveName = `${ARCHIVE_PREFIX}/backup-${SOURCE_BUCKET}-${timestamp}.zip`;

    console.log(`Creating archive: ${archiveName}`);
    const uploadResult = await createAndUploadArchive(
      sourceClient,
      destClient,
      SOURCE_BUCKET,
      DEST_BUCKET,
      objects,
      archiveName
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      statusCode: 200,
      body: {
        message: 'Backup completed successfully',
        sourceBucket: SOURCE_BUCKET,
        destinationBucket: DEST_BUCKET,
        archiveName: archiveName,
        filesBackedUp: objects.length,
        archiveSize: uploadResult.size,
        durationSeconds: parseFloat(duration)
      }
    };

  } catch (error) {
    console.error('Backup failed:', error);
    return {
      statusCode: 500,
      body: {
        error: 'Backup failed',
        message: error.message,
        stack: error.stack
      }
    };
  }
}

/**
 * List all objects in a bucket, handling pagination
 */
async function listAllObjects(client, bucket) {
  const objects = [];
  let continuationToken = undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken
    });

    const response = await client.send(command);

    if (response.Contents) {
      objects.push(...response.Contents);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

/**
 * Create a zip archive of all objects and upload to destination bucket
 * Uses streaming to handle large files efficiently
 */
async function createAndUploadArchive(sourceClient, destClient, sourceBucket, destBucket, objects, archiveName) {
  // Create a pass-through stream for the upload
  const passThrough = new PassThrough();

  // Create the archiver
  const archive = archiver('zip', {
    zlib: { level: 6 } // Compression level (0-9)
  });

  let totalSize = 0;
  let archiveSize = 0;

  // Track upload progress
  archive.on('progress', (progress) => {
    console.log(`Archive progress: ${progress.entries.processed}/${progress.entries.total} files`);
  });

  // Track when archive finishes writing
  const archiveEndPromise = new Promise((resolveEnd, rejectEnd) => {
    archive.on('end', () => {
      archiveSize = archive.pointer();
      console.log(`Archive finished writing. Total size: ${archiveSize} bytes`);
      resolveEnd();
    });
    archive.on('error', rejectEnd);
  });

  // Handle pass-through stream errors
  const passThroughErrorPromise = new Promise((_, rejectError) => {
    passThrough.on('error', rejectError);
  });

  // Pipe the archive to the pass-through stream
  archive.pipe(passThrough);

  // Start the upload to destination bucket using Upload for streaming
  const upload = new Upload({
    client: destClient,
    params: {
      Bucket: destBucket,
      Key: archiveName,
      Body: passThrough,
      ContentType: 'application/zip'
    }
  });

  // Track upload progress
  upload.on('httpUploadProgress', (progress) => {
    if (progress.total) {
      console.log(`Upload progress: ${Math.round((progress.loaded / progress.total) * 100)}%`);
    }
  });

  const uploadPromise = upload.done();

  // Add files to archive
  try {
    for (const obj of objects) {
      console.log(`Adding to archive: ${obj.Key}`);

      // Get the object from source bucket
      const getCommand = new GetObjectCommand({
        Bucket: sourceBucket,
        Key: obj.Key
      });

      const response = await sourceClient.send(getCommand);

      // Convert the response body to a readable stream if it isn't already
      let stream;
      if (response.Body instanceof Readable) {
        stream = response.Body;
      } else {
        stream = Readable.from(response.Body);
      }

      // Add the file to the archive
      archive.append(stream, { name: obj.Key });
      totalSize += obj.Size || 0;
    }

    // Finalize the archive - this will trigger the 'end' event when done
    console.log('Finalizing archive...');
    await archive.finalize();

    // Wait for the archive to finish writing all data and upload to complete
    // Use Promise.race to catch any errors from passThrough stream
    await Promise.race([
      Promise.all([archiveEndPromise, uploadPromise]),
      passThroughErrorPromise
    ]);

    console.log('Upload completed');
    return {
      success: true,
      size: totalSize,
      archiveSize: archiveSize
    };

  } catch (error) {
    archive.destroy();
    passThrough.destroy();
    throw error;
  }
}

export { main };
