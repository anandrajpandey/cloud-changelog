output "amplify_default_domain" {
  description = "Amplify app default domain"
  value       = aws_amplify_app.site.default_domain
}

output "amplify_branch_url" {
  description = "Production branch URL"
  value       = "https://master.${aws_amplify_app.site.default_domain}"
}
