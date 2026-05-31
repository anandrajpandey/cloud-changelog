import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { db } from "@/lib/dynamodb";

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "CloudChangelogArticles";

export const DAILY_CATEGORY_LIMIT = 2;

function getUtcDayRange(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return {
    day,
    start: `${day}T00:00:00.000Z`,
    end: `${day}T23:59:59.999Z`,
  };
}

export async function getTodayArticleCount(category: string) {
  const { start, end } = getUtcDayRange();
  let count = 0;
  let lastEvaluatedKey: Record<string, unknown> | undefined;

  do {
    const result = await db.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        Select: "COUNT",
        ExclusiveStartKey: lastEvaluatedKey,
        FilterExpression:
          "#category = :category AND #createdAt BETWEEN :start AND :end AND (attribute_not_exists(#itemType) OR #itemType = :article)",
        ExpressionAttributeNames: {
          "#category": "category",
          "#createdAt": "createdAt",
          "#itemType": "itemType",
        },
        ExpressionAttributeValues: {
          ":category": category,
          ":start": start,
          ":end": end,
          ":article": "article",
        },
      })
    );

    count += result.Count || 0;
    lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastEvaluatedKey);

  return count;
}

export async function getRemainingDailyCategorySlots(category: string) {
  const count = await getTodayArticleCount(category);
  return Math.max(0, DAILY_CATEGORY_LIMIT - count);
}
