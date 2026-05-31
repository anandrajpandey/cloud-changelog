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

data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "${path.module}/lambda.zip"

  source {
    filename = "index.mjs"
    content  = <<-EOF
      import https from "https";

      const endpoints = [
        "/api/sync",
        "/api/sync/companies",
        "/api/sync/architectures",
      ];

      function invokeEndpoint(baseUrl, endpoint, token) {
        return new Promise((resolve, reject) => {
          const url = new URL(endpoint, baseUrl);
          const req = https.request(
            url,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer $${token}`,
              },
              timeout: 300000,
            },
            (res) => {
              let body = "";

              res.on("data", (chunk) => {
                body += chunk;
              });

              res.on("end", () => {
                const ok = (res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300;
                resolve({
                  endpoint,
                  statusCode: res.statusCode || 500,
                  ok,
                  body,
                });
              });
            }
          );

          req.on("timeout", () => {
            req.destroy(new Error(`Request timed out for $${endpoint}`));
          });

          req.on("error", (error) => {
            reject(error);
          });

          req.end();
        });
      }

      export const handler = async () => {
        const baseUrl = process.env.APP_URL;
        const token = process.env.SYNC_SECRET;

        if (!baseUrl) {
          throw new Error("APP_URL is not configured");
        }

        if (!token) {
          throw new Error("SYNC_SECRET is not configured");
        }

        const results = [];

        for (const endpoint of endpoints) {
          const result = await invokeEndpoint(baseUrl, endpoint, token);
          console.log(JSON.stringify(result));
          results.push(result);
        }

        const failures = results.filter((result) => !result.ok);
        if (failures.length > 0) {
          throw new Error(`One or more sync endpoints failed: $${JSON.stringify(failures)}`);
        }

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            baseUrl,
            results,
          }),
        };
      };
    EOF
  }
}

resource "aws_lambda_function" "sync_cron" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "${var.project_name}-sync"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
  runtime          = "nodejs20.x"
  timeout          = 900

  environment {
    variables = {
      APP_URL     = "https://${aws_amplify_branch.main.branch_name}.${aws_amplify_app.site.default_domain}"
      SYNC_SECRET = var.sync_secret
    }
  }
}

resource "aws_cloudwatch_event_rule" "daily_sync" {
  name                = "${var.project_name}-daily-sync"
  description         = "Trigger the hosted sync routes every day"
  schedule_expression = var.cron_schedule_expression
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
