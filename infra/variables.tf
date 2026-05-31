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

variable "google_api_key" {
  description = "Fallback Google API key for Gemini"
  type        = string
  sensitive   = true
}

variable "llm_api_key" {
  description = "Neutral fallback API key for Gemini"
  type        = string
  sensitive   = true
}

variable "sync_secret" {
  description = "Secret key for Lambda cron to authenticate with Next.js sync endpoint"
  type        = string
  sensitive   = true
}

variable "github_token" {
  description = "GitHub personal access token with repo access for Amplify app creation"
  type        = string
  sensitive   = true
}
