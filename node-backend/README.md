# Node Backend

This directory is reserved for the hospital node backend service.

## Coming Soon

The node-backend will provide:
- Local data processing and anonymization
- MinIO object storage integration
- Data catalog management via Nessie
- Query processing on local hospital data
- Secure data export with presigned URLs

## Current Architecture

For now, the `node-web` frontend communicates directly with the `central-backend` API for:
- Node handshake and authentication
- Viewing data access requests
- Submitting responses with presigned URLs

## Future Implementation

The node-backend will be implemented as an independent service that:
1. Maintains its own local database of patient records
2. Processes incoming data access requests
3. Generates anonymized datasets
4. Stores data in local MinIO instance
5. Communicates with central-backend via RabbitMQ
6. Manages Iceberg tables through Nessie catalog

## Tech Stack (Planned)

- **Language**: Go or Python
- **Database**: PostgreSQL (local patient data)
- **Storage**: MinIO (local object storage)
- **Catalog**: Nessie (Iceberg table versioning)
- **Message Queue**: RabbitMQ (async communication with central)
- **Framework**: To be determined based on requirements
