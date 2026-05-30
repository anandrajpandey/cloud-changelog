variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
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

variable "github_repository" {
  description = "GitHub repository for Amplify (e.g., username/repo)"
  type        = string
}

variable "github_token" {
  description = "GitHub personal access token for Amplify to pull source code"
  type        = string
  sensitive   = true
}

variable "custom_domain_name" {
  description = "Custom domain name (e.g., mydomain.com). Leave empty to use Amplify default URL."
  type        = string
  default     = ""
}
