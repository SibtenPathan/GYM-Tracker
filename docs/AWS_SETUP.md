# AWS setup for the gym member app

This setup creates one Cognito User Pool, one Identity Pool, a hosted sign-in domain, Google sign-in, one DynamoDB table with an exercise-history index, one private S3 bucket, and narrowly scoped IAM roles. It does **not** create permanent AWS access keys. Signed-in members receive temporary credentials restricted to their own DynamoDB partition and S3 photo folder.

## 1. Deploy the stack

1. Sign in to the AWS Console and choose the region in which you want the app's data to live. Keep the same region for all resources.
2. Open **CloudFormation → Create stack → With new resources (standard)**.
3. In Google Cloud Console, configure the Google Auth Platform consent screen and create an OAuth client of type **Web application**. Add the following authorized redirect URI exactly: `https://<your-cognito-domain-prefix>.auth.<your-region>.amazoncognito.com/oauth2/idpresponse`. Keep the Google client ID and client secret ready for the CloudFormation parameters; the secret is marked `NoEcho` and is not a browser setting.
4. Upload `infra/aws/gym-member-stack.yaml`.
5. Enter a globally unique lowercase Cognito domain prefix, your Google OAuth client ID and secret, your exact HTTPS preview origin, and the exact HTTPS origin you plan to publish. Origins have no trailing slash. Set `LocalDevOrigin` to `http://localhost:8080` only if you need local development.
6. Review and submit. CloudFormation creates the stack resources in your AWS account. Cognito phone verification can incur SMS charges; AWS account SMS sandbox restrictions may limit who can receive codes.
7. When status is **CREATE_COMPLETE**, open **Outputs** and copy the outputs into `.env` as described below.

The Cognito pool is configured for email or phone-number sign-up with password sign-in. Google uses Cognito's hosted authorization-code flow with PKCE. At least one verified contact method is needed for recovery. The account uses Cognito's default email sender; SMS delivery uses Amazon SNS. Before public phone sign-up, check your AWS region's SMS origination registration/sandbox requirements. Adding a Google provider or hosted domain later requires updating the stack and registered Google redirect URI.

## 2. Add app configuration

Copy `.env.example` to `.env` in the project root and set:

| Variable | CloudFormation output |
| --- | --- |
| `VITE_AWS_REGION` | `AwsRegion` |
| `VITE_COGNITO_USER_POOL_ID` | `CognitoUserPoolId` |
| `VITE_COGNITO_USER_POOL_CLIENT_ID` | `CognitoUserPoolClientId` |
| `VITE_COGNITO_IDENTITY_POOL_ID` | `CognitoIdentityPoolId` |
| `VITE_COGNITO_HOSTED_UI_DOMAIN` | `CognitoHostedUiDomain` (hostname only; no `https://` or trailing slash) |
| `VITE_DYNAMODB_TABLE_NAME` | `DynamoDbTableName` |
| `VITE_S3_AVATAR_BUCKET_NAME` | `ProfilePhotosBucketName` |

These values identify public resources; they are not passwords or AWS keys. **Do not add IAM access keys, Google client secrets, or Cognito app-client secrets to `.env` or browser code.** The stack uses temporary Cognito-issued credentials after sign-in. Keep `.env` out of source control, restart the preview after adding its values, and update the stack's callback, logout, and S3 origin parameters if the app URL changes.

## 3. Data layout

The DynamoDB table uses string keys `PK` and `SK` with on-demand billing and encryption. Every partition key is the member's Cognito Identity Pool identity ID; its IAM role only authorizes that identity's partition.

| Record | `PK` | `SK` | Example fields |
| --- | --- | --- | --- |
| Member profile | identity ID | `PROFILE` | `name`, `email`, `phone`, `heightCm`, `bodyWeight`, `weightUnit`, `avatarKey`, `updatedAt` |
| Planned exercise | identity ID | `PLAN#<weekday>#<exerciseId>` | `day`, `exerciseId`, `exerciseName`, `targetSets`, `targetReps`, `createdAt`, `updatedAt` |
| Workout session | identity ID | `SESSION#<ISO timestamp>#<sessionId>` | `startedAt`, `completedAt`, `day`, `exerciseIds` |
| Exercise set | identity ID | `SET#<exerciseId>#<ISO timestamp>#<sessionId>#<setNumber>` | `exerciseName`, `setNumber`, `reps`, `weight`, `weightUnit`, `recordedAt`, `sessionId` |

The `ExerciseHistoryIndex` stores member identity as its partition key and `<exerciseId>#<timestamp>#<sessionId>#<set>` as its sort key. It lets the app query the member's earlier sets for a particular exercise. Weight values include the unit used on the day; the app converts historical values for display if a member later changes their preferred unit.

## 4. Cost and safety notes

- The DynamoDB table uses on-demand billing. DynamoDB reads/writes, stored records, S3 storage/requests, data transfer, Cognito SMS, and any applicable taxes are billed according to AWS region and actual use; none are guaranteed free.
- Cognito Lite and Essentials have a 10,000 monthly active user free tier; Cognito Plus has no free tier. Other AWS services and SMS can still cost money.
- The template enables point-in-time recovery and deletion protection for DynamoDB, deletion protection for Cognito, blocks public S3 access, and encrypts stored data. These protections may need to be deliberately disabled before deleting resources.
- Set an AWS Budget alert before inviting real members. Review pricing for your chosen region and expected SMS volume.

## 5. If you need to remove the stack

The table, user pool, and bucket have deletion protection enabled, and the bucket may contain member photos. Do not remove them casually. Export/retain any member data you need, empty the bucket only if you truly intend to delete those files, deliberately disable resource protections, and then delete the CloudFormation stack.