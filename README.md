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

# Linux
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.98.0/doctl-1.98.0-linux-amd64.tar.gz
tar xf ~/doctl-1.98.0-linux-amd64.tar.gz
sudo mv ~/doctl /usr/local/bin

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

Edit `.env` with your configuration:

```env
# Source bucket (the bucket you want to backup)
SOURCE_BUCKET=my-source-bucket
SOURCE_REGION=nyc3
SOURCE_ENDPOINT=https://nyc3.digitaloceanspaces.com

# Destination bucket (where the backup archive will be stored)
DEST_BUCKET=my-backup-bucket
DEST_REGION=nyc3
DEST_ENDPOINT=https://nyc3.digitaloceanspaces.com

# Your Spaces credentials
SPACES_KEY=your-spaces-access-key
SPACES_SECRET=your-spaces-secret-key

# Archive prefix (optional)
ARCHIVE_PREFIX=backups
```

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
https://faas-nyc1-2ef2e6cc.doserverless.co/api/v1/web/fn-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/backup/backup
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

### Available Regions

- `nyc3` - New York 3
- `sfo3` - San Francisco 3
- `ams3` - Amsterdam 3
- `sgp1` - Singapore 1
- `fra1` - Frankfurt 1
- `syd1` - Sydney 1

### Function Limits

Configured in `project.yml`:
- Timeout: 15 minutes (900,000 ms)
- Memory: 1GB RAM

Adjust these if needed for larger buckets.

## How It Works

1. **List Objects**: The function retrieves a complete list of all objects in the source bucket, handling pagination automatically
2. **Create Archive**: Uses the `archiver` library to create a ZIP archive
3. **Stream Download**: Each object is streamed from the source bucket
4. **Stream Upload**: The archive is simultaneously streamed to the destination bucket
5. **Complete**: Returns a summary with file count, size, and duration

## Limitations

- **Size**: Limited by function memory (1GB) and timeout (15 minutes)
- **Large Buckets**: For very large buckets (100GB+), consider:
  - Increasing function memory and timeout in `project.yml`
  - Splitting the backup into multiple archives by prefix
  - Using a DigitalOcean Droplet instead
- **Bandwidth**: Subject to DigitalOcean bandwidth limits

## Troubleshooting

### Function Times Out

Increase the timeout in `project.yml`:
```yaml
limits:
  timeout: 1800000  # 30 minutes
  memory: 2048      # 2GB RAM
```

### Out of Memory

Either:
- Increase memory allocation in `project.yml`
- Reduce compression level in `packages/backup/backup/backup.js`:
  ```javascript
  zlib: { level: 1 } // Faster, less compression
  ```

### Missing Environment Variables

Ensure all required variables are set in `.env` and redeploy:
```bash
doctl serverless deploy .
```

## Development

### Local Testing

You can test the function locally by running it with Node.js:

```bash
# Set environment variables
export SOURCE_BUCKET=my-source-bucket
export DEST_BUCKET=my-backup-bucket
export SPACES_KEY=your-key
export SPACES_SECRET=your-secret

# Run the function
node -e "require('./packages/backup/backup/backup.js').main({})"
```

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
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
