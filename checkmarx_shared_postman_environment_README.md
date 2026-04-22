# Shared Postman Environment Template

Import this environment once, then use it with the step-by-step Postman requests generated during the AI-guided flow.

## Variables the user typically fills in
- region
- tenant_account_name
- refresh_token (or client_secret if using client_credentials)
- iam_base_url
- ast_base_url
- project_name
- application_name
- zip_file_path

## Variables Postman can auto-fill from response scripts
- access_token
- expires_in
- project_id
- application_id
- upload_url
- scan_id

## Region base URLs

### AST base URL
- US → https://ast.checkmarx.net
- US2 → https://us.ast.checkmarx.net
- EU → https://eu.ast.checkmarx.net
- EU2 → https://eu-2.ast.checkmarx.net
- DEU → https://deu.ast.checkmarx.net
- ANZ → https://anz.ast.checkmarx.net
- IND → https://ind.ast.checkmarx.net
- SNG → https://sng.ast.checkmarx.net
- MEA → https://mea.ast.checkmarx.net
- IL → https://gov-il.ast.checkmarx.net

### IAM base URL
- US → https://iam.checkmarx.net/auth/realms
- US2 → https://us.iam.checkmarx.net/auth/realms
- EU → https://eu.iam.checkmarx.net/auth/realms
- EU2 → https://eu-2.iam.checkmarx.net/auth/realms
- DEU → https://deu.iam.checkmarx.net/auth/realms
- ANZ → https://anz.iam.checkmarx.net/auth/realms
- IND → https://ind.iam.checkmarx.net/auth/realms
- SNG → https://sng.iam.checkmarx.net/auth/realms
- MEA → https://mea.iam.checkmarx.net/auth/realms

## Recommended usage
1. Import this environment.
2. Select it in Postman.
3. Let the AI guide the user one step at a time.
4. For each step, import the AI-generated Postman request that uses these same variable names.
5. Run the request. Response scripts can store the next values automatically.

## Notes
- `refresh_token`, `client_secret`, and `access_token` are marked as secret variables.
- `IL` is included for AST base URL, but no IAM IL mapping was previously validated in the tested auth flow.
- `zip_file_path` may still need manual file selection in Postman depending on the request/import behavior.
