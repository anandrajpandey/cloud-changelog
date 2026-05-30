"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import Link from "next/link";
import type { Article } from "@/lib/dynamodb";
import { formatRelativeDate, isValidDate } from "@/lib/date";

export function ArticleCard({ article, index }: { article: Article, index: number }) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ y: -5, scale: 1.01 }}
      className="group h-full relative"
    >
      <Link href={`/article/${article.slug}`}>
        <Card className="relative z-0 h-full flex flex-col overflow-hidden hover:border-primary/50 transition-colors bg-card hover:shadow-lg hover:shadow-primary/5">
          <motion.svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 z-20 h-full w-full"
            aria-hidden="true"
          >
            <motion.rect
              x="1"
              y="1"
              width="98"
              height="98"
              rx="12"
              ry="12"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1000"
              strokeDashoffset={isHovered ? 0 : 1000}
              opacity={isHovered ? 1 : 0}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </motion.svg>
          <CardHeader>
            <div className="flex justify-between items-start mb-2">
              <span className="text-sm font-medium text-primary">
                {article.category}
              </span>
              {isValidDate(article.publishedAt) && (
                <span className="text-xs text-muted-foreground">
                  {formatRelativeDate(article.publishedAt)}
                </span>
              )}
            </div>
            <CardTitle className="line-clamp-2 text-xl leading-tight font-heading">
              {article.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1">
            <CardDescription className="line-clamp-3 text-muted-foreground">
              {article.summary}
            </CardDescription>
          </CardContent>
          <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 pb-4 pt-0 text-sm text-muted-foreground">
            {(article.tags || []).slice(0, 3).map(tag => (
              <span key={tag} className="font-medium text-foreground/90">
                #{tag}
              </span>
            ))}
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
