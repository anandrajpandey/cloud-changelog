import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-east-1"
});

export const db = DynamoDBDocumentClient.from(client);

// Schema Type for TypeScript (Article)
export interface ArticleSection {
  id: string;
  title: string;
  subtitle?: string;
  content: string | string[];
  images?: string[];
}

export interface Article {
  id: string; // The URL or unique hash
  itemType?: "article";
  title: string;
  slug: string;
  summary?: string;
  whatsNew?: string;
  aboutUpdate?: string;
  whyItMatters?: string;
  impact?: string;
  beforeAfter?: string;
  useCases?: string | string[];
  keyTakeaways?: string | string[];
  sections?: ArticleSection[];
  category: string;
  tags: string[];
  sourceUrl: string;
  images?: Record<string, string[]>;
  publishedAt: string; // ISO date
  createdAt: string; // ISO date
}

export interface ArticleComment {
  id: string;
  itemType: "comment";
  articleSlug: string;
  parentId: string | null;
  name: string;
  anonymous: boolean;
  content: string;
  createdAt: string;
  updatedAt: string;
}
