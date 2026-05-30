# DynamoDB
resource "aws_dynamodb_table" "articles" {
  name           = "CloudChangelogArticles"
  billing_mode   = "PAY_PER_REQUEST" # Free tier friendly
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "slug"
    type = "S"
  }

  # Global Secondary Index to query by slug
  global_secondary_index {
    name               = "SlugIndex"
    hash_key           = "slug"
    projection_type    = "ALL"
  }

  tags = {
    Project = var.project_name
  }
}

# IAM Role for Amplify (if needed) and Lambda
resource "aws_iam_role" "amplify_role" {
  name = "${var.project_name}-amplify-role"

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

resource "aws_iam_role_policy_attachment" "amplify_admin_access" {
  role       = aws_iam_role.amplify_role.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess-Amplify"
}

# Amplify App
resource "aws_amplify_app" "nextjs_app" {
  name       = var.project_name
  repository = "https://github.com/${var.github_repository}"
  
  access_token = var.github_token

  # Environment variables for Next.js app
  environment_variables = {
    GEMINI_API_KEY      = var.gemini_api_key
    SYNC_SECRET         = var.sync_secret
    DYNAMODB_TABLE_NAME = aws_dynamodb_table.articles.name
    # Since AWS Amplify hosting automatically manages AWS credentials for the backend, 
    # we don't strictly need API keys here, but if using standard Next.js deploy, 
    # Amplify injects execution roles automatically.
  }

  iam_service_role_arn = aws_iam_role.amplify_role.arn

  lifecycle {
    # Keep the existing GitHub connection stable on subsequent applies.
    # Amplify only needs the token to create/import the app; updates can fail
    # if Terraform keeps re-sending an expired or rejected token.
    ignore_changes = [access_token]
  }

  # Next 15 build specification
  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
  EOT
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.nextjs_app.id
  branch_name = "main"
  framework   = "Next.js - SSR"
}

# Optional Custom Domain Configuration
resource "aws_amplify_domain_association" "domain" {
  count       = var.custom_domain_name != "" ? 1 : 0
  app_id      = aws_amplify_app.nextjs_app.id
  domain_name = var.custom_domain_name

  # https://example.com
  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = ""
  }

  # https://www.example.com
  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = "www"
  }
}
