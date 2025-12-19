# Spaces S3 Backup Function

A DigitalOcean Function that backs up the complete contents of a DigitalOcean Spaces bucket by archiving all files into a ZIP and uploading it to a destination bucket.

## Features

- Downloads all objects from a source Spaces bucket
- Creates a compressed ZIP archive
- Uploads the archive to a destination bucket
- Uses streaming for memory-efficient processing
- Handles pagination for large buckets
- Configurable via environment variables
- Supports cross-region backups

## Prerequisites

- [DigitalOcean Account](https://cloud.digitalocean.com)
- [DigitalOcean CLI (`doctl`)](https://docs.digitalocean.com/reference/doctl/how-to/install/)
- Two DigitalOcean Spaces buckets (source and destination)
- Spaces API credentials (Access Key and Secret)

## Setup

### 1. Install the DigitalOcean CLI

```bash
# macOS
brew install doctl

# Authenticate
doctl auth init
```

### 2. Connect to DigitalOcean Functions

```bash
doctl serverless connect
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration

### 4. Install Dependencies

```bash
npm install
```

## Deployment

Deploy the function to DigitalOcean:

```bash
doctl serverless deploy .
```

The function will be available at a URL like:
```
https://faas-nyc1-x.doserverless.co/api/v1/web/fn-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/backup/backup
```

## Usage

### Manual Invocation

You can invoke the function via HTTP request or using the CLI:

```bash
# Using doctl
doctl serverless functions invoke backup/backup

# Using curl (replace with your function URL)
curl -X POST https://your-function-url/backup/backup
```

### Scheduled Backups

To run backups automatically, you can:

1. **Use DigitalOcean Functions Triggers** (when available)
2. **Use a cron job** with `doctl`:
   ```bash
   # Add to crontab to run daily at 2 AM
   0 2 * * * /usr/local/bin/doctl serverless functions invoke backup/backup
   ```
3. **Use a third-party service** like [cron-job.org](https://cron-job.org) to hit the function URL

## Response Format

Successful backup:
```json
{
  "statusCode": 200,
  "body": {
    "message": "Backup completed successfully",
    "sourceBucket": "my-source-bucket",
    "destinationBucket": "my-backup-bucket",
    "archiveName": "backups/backup-my-source-bucket-2025-12-19T10-30-00-000Z.zip",
    "filesBackedUp": 150,
    "archiveSize": 104857600,
    "durationSeconds": 45.32
  }
}
```

Error response:
```json
{
  "statusCode": 500,
  "body": {
    "error": "Backup failed",
    "message": "Error description",
    "stack": "..."
  }
}
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOURCE_BUCKET` | Yes | - | Name of the source Spaces bucket |
| `SOURCE_REGION` | No | `nyc3` | Region of the source bucket |
| `SOURCE_ENDPOINT` | No | Auto-generated | Custom S3 endpoint for source |
| `DEST_BUCKET` | Yes | - | Name of the destination bucket |
| `DEST_REGION` | No | `nyc3` | Region of the destination bucket |
| `DEST_ENDPOINT` | No | Auto-generated | Custom S3 endpoint for destination |
| `SPACES_KEY` | Yes | - | Spaces access key ID |
| `SPACES_SECRET` | Yes | - | Spaces secret access key |
| `ARCHIVE_PREFIX` | No | `backups` | Prefix/folder for backup archives |

### Function Limits

Configured in `project.yml`:
- Timeout: 15 minutes (900,000 ms)
- Memory: 1GB RAM

Adjust these if needed for larger buckets.

## How It Works

1. **List Objects**: The function retrieves a complete list of all objects in the source bucket using `@aws-sdk/client-s3`, handling pagination automatically
2. **Create Archive**: Uses the `archiver` library (v7) to create a streaming ZIP archive
3. **Stream Download**: Each object is streamed from the source bucket using the AWS SDK v3 `GetObjectCommand`
4. **Stream Upload**: The archive is simultaneously streamed to the destination bucket using `@aws-sdk/lib-storage` for efficient multipart uploads
5. **Complete**: Returns a summary with file count, size, and duration

## Limitations

- **Size**: Limited by function memory (1GB) and timeout (15 minutes)
- **Large Buckets**: For very large buckets (100GB+), consider:
  - Increasing function memory and timeout in `project.yml`
  - Splitting the backup into multiple archives by prefix
  - Using a DigitalOcean Droplet instead
- **Bandwidth**: Subject to DigitalOcean bandwidth limits

## Dependencies

The function uses the following key libraries:

- **[@aws-sdk/client-s3](https://www.npmjs.com/package/@aws-sdk/client-s3)** (v3) - S3-compatible operations for DigitalOcean Spaces
- **[@aws-sdk/lib-storage](https://www.npmjs.com/package/@aws-sdk/lib-storage)** (v3) - Managed multipart uploads with streaming support
- **[archiver](https://www.npmjs.com/package/archiver)** (v7) - Streaming ZIP archive creation

## Troubleshooting

### View Logs

```bash
doctl serverless activations list
doctl serverless activations get <activation-id> --logs
```

## License

MIT

## Resources

- [DigitalOcean Functions Documentation](https://docs.digitalocean.com/products/functions/)
- [DigitalOcean Spaces Documentation](https://docs.digitalocean.com/products/spaces/)
- [AWS SDK for JavaScript v3 - Client S3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/)
- [AWS SDK for JavaScript v3 - Lib Storage](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-lib-storage/)
- [Archiver Documentation](https://www.archiverjs.com/)
