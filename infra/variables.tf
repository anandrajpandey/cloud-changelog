variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "cloud-changelog"
}

variable "gemini_api_key" {
  description = "Gemini API Key for content generation"
  type        = string
  sensitive   = true
}

variable "sync_secret" {
  description = "Secret key for Lambda cron to authenticate with Next.js sync endpoint"
  type        = string
  sensitive   = true
}

variable "app_url" {
  description = "Public URL of the frontend app (for example, a Netlify site URL)"
  type        = string
}
