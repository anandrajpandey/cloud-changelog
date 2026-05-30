# Lambda function that hits the Next.js API sync endpoint daily
resource "aws_iam_role" "lambda_exec" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# The inline deployment package for Lambda - simple curl script
data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "${path.module}/lambda.zip"
  
  source {
    content  = <<-EOF
      import https from 'https';

      export const handler = async (event) => {
        const HOST = process.env.APP_URL;
        
        return new Promise((resolve, reject) => {
          const req = https.request(
            HOST + '/api/sync',
            { 
              method: 'POST',
              headers: {
                'Authorization': `Bearer $${process.env.SYNC_SECRET}`
              }
            },
            (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
            }
          );
          
          req.on('error', (e) => reject(e));
          req.end();
        });
      };
    EOF
    filename = "index.mjs"
  }
}

resource "aws_lambda_function" "sync_cron" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.project_name}-sync"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 300 # 5 minutes

  environment {
    variables = {
      # Use custom domain if set, otherwise fallback to standard Amplify URL
      APP_URL     = var.custom_domain_name != "" ? "https://${var.custom_domain_name}" : "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.nextjs_app.id}.amplifyapp.com"
      SYNC_SECRET = var.sync_secret
    }
  }
}

# EventBridge rule to run Lambda daily
resource "aws_cloudwatch_event_rule" "daily_sync" {
  name                = "${var.project_name}-daily-sync"
  description         = "Trigger sync API daily"
  schedule_expression = "rate(1 day)"
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  rule      = aws_cloudwatch_event_rule.daily_sync.name
  target_id = "SyncLambda"
  arn       = aws_lambda_function.sync_cron.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sync_cron.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_sync.arn
}
