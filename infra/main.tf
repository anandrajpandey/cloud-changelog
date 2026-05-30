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

