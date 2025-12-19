const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const archiver = require('archiver');
const { Readable, PassThrough } = require('stream');

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
  return new Promise(async (resolve, reject) => {
    // Create a pass-through stream for the upload
    const passThrough = new PassThrough();

    // Create the archiver
    const archive = archiver('zip', {
      zlib: { level: 6 } // Compression level (0-9)
    });

    let totalSize = 0;

    // Track upload progress
    archive.on('progress', (progress) => {
      console.log(`Archive progress: ${progress.entries.processed}/${progress.entries.total} files`);
    });

    // Handle archiver errors
    archive.on('error', (err) => {
      reject(err);
    });

    // Pipe the archive to the pass-through stream
    archive.pipe(passThrough);

    // Start the upload to destination bucket
    const uploadPromise = destClient.send(new PutObjectCommand({
      Bucket: destBucket,
      Key: archiveName,
      Body: passThrough,
      ContentType: 'application/zip'
    }));

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

      // Finalize the archive
      console.log('Finalizing archive...');
      await archive.finalize();

      // Wait for upload to complete
      await uploadPromise;

      console.log('Upload completed');
      resolve({
        success: true,
        size: totalSize,
        archiveSize: archive.pointer()
      });

    } catch (error) {
      archive.destroy();
      reject(error);
    }
  });
}

module.exports.main = main;
