output "amplify_default_domain" {
  description = "Amplify app default domain"
  value       = aws_amplify_app.site.default_domain
}

output "amplify_branch_url" {
  description = "Production branch URL"
  value       = "https://master.${aws_amplify_app.site.default_domain}"
}

output "sync_lambda_name" {
  description = "Lambda function that triggers the sync routes"
  value       = aws_lambda_function.sync_cron.function_name
}

output "sync_schedule_name" {
  description = "EventBridge rule that schedules the daily sync"
  value       = aws_cloudwatch_event_rule.daily_sync.name
}
