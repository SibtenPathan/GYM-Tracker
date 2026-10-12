## AWS Member Data Access

- Authenticate members with a Cognito User Pool and use its Identity Pool to issue temporary, per-member AWS credentials for browser-side DynamoDB and S3 access; avoid long-lived AWS keys so IAM can scope each member to their own records and photo prefix.
- Render the member experience at `/` through the TanStack file route, with route-specific metadata on each content route.
