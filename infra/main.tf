resource "aws_dynamodb_table" "articles" {
  name         = "CloudChangelogArticles"
  billing_mode = "PAY_PER_REQUEST" # Free tier friendly
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "slug"
    type = "S"
  }

  global_secondary_index {
    name            = "SlugIndex"
    hash_key        = "slug"
    projection_type = "ALL"
  }

  tags = {
    Project = var.project_name
  }
}

resource "aws_iam_role" "amplify_service_role" {
  name = "${var.project_name}-amplify-service-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "amplify.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "amplify_service_managed" {
  role       = aws_iam_role.amplify_service_role.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess-Amplify"
}

resource "aws_iam_role" "amplify_compute_role" {
  name = "${var.project_name}-amplify-compute-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "amplify.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_policy" "amplify_compute_dynamo" {
  name        = "${var.project_name}-amplify-compute-dynamo"
  description = "Allow Amplify SSR compute to read and write CloudChangelogArticles in DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:UpdateItem",
          "dynamodb:DescribeTable"
        ]
        Resource = [
          aws_dynamodb_table.articles.arn,
          "${aws_dynamodb_table.articles.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_secretsmanager_secret" "gemini_api_key" {
  name = var.gemini_secret_name
}

resource "aws_secretsmanager_secret_version" "gemini_api_key" {
  secret_id     = aws_secretsmanager_secret.gemini_api_key.id
  secret_string = var.gemini_api_key
}

resource "aws_iam_policy" "amplify_compute_gemini_secret" {
  name        = "${var.project_name}-amplify-compute-gemini-secret"
  description = "Allow Amplify SSR compute to read the Gemini API key from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.gemini_api_key.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "amplify_compute_gemini_secret" {
  role       = aws_iam_role.amplify_compute_role.name
  policy_arn = aws_iam_policy.amplify_compute_gemini_secret.arn
}

resource "aws_iam_role_policy_attachment" "amplify_compute_dynamo" {
  role       = aws_iam_role.amplify_compute_role.name
  policy_arn = aws_iam_policy.amplify_compute_dynamo.arn
}

resource "aws_amplify_app" "site" {
  name         = var.project_name
  repository   = "https://github.com/anandrajpandey/cloud-changelog"
  platform     = "WEB_COMPUTE"
  access_token = var.github_token

  build_spec = file("${path.module}/../amplify.yml")

  iam_service_role_arn = aws_iam_role.amplify_service_role.arn
  compute_role_arn     = aws_iam_role.amplify_compute_role.arn

  environment_variables = {
    DYNAMODB_TABLE_NAME = aws_dynamodb_table.articles.name
    GEMINI_SECRET_NAME  = var.gemini_secret_name
    LLM_API_KEY         = var.llm_api_key
    GEMINI_API_KEY      = var.gemini_api_key
    GOOGLE_API_KEY      = var.google_api_key
    SYNC_SECRET         = var.sync_secret
    CRON_SECRET         = var.sync_secret
  }

  enable_branch_auto_build    = true
  enable_branch_auto_deletion = false
  enable_basic_auth           = false
}

resource "aws_amplify_branch" "main" {
  app_id            = aws_amplify_app.site.id
  branch_name       = "master"
  stage             = "PRODUCTION"
  framework         = "Next.js - SSR"
  enable_auto_build = true

  environment_variables = {
    DYNAMODB_TABLE_NAME = aws_dynamodb_table.articles.name
    GEMINI_SECRET_NAME  = var.gemini_secret_name
    LLM_API_KEY         = var.llm_api_key
    GEMINI_API_KEY      = var.gemini_api_key
    GOOGLE_API_KEY      = var.google_api_key
    SYNC_SECRET         = var.sync_secret
    CRON_SECRET         = var.sync_secret
  }
}

