"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import type { Article, ArticleComment, ArticleSection } from "@/lib/dynamodb";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarDays,
  ExternalLink,
  ArrowLeft,
  Lightbulb,
  MessageSquare,
  X,
  Send,
  Reply,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { formatLongDate, formatRelativeDate } from "@/lib/date";

const legacySectionMeta: Array<{
  id: string;
  title: string;
  icon?: ReactNode;
}> = [
  {
    id: "whatsNew",
    title: "What's New?",
    icon: <Lightbulb className="w-5 h-5 text-primary" />,
  },
  { id: "aboutUpdate", title: "About The Update" },
  { id: "whyItMatters", title: "Why It Matters" },
  { id: "impact", title: "Impact on Existing Systems" },
  { id: "beforeAfter", title: "Before vs After" },
  { id: "useCases", title: "Practical Use Cases" },
  { id: "keyTakeaways", title: "Key Takeaways" },
];

function formatContent(content: string | string[]) {
  const parseBold = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <strong key={i} className="text-foreground font-semibold">
          {part}
        </strong>
      ) : (
        part
      ),
    );
  };

  if (Array.isArray(content)) {
    return (
      <ul className="list-disc pl-6 space-y-3">
        {content.map((item, i) => (
          <li key={i}>{parseBold(item)}</li>
        ))}
      </ul>
    );
  }

  return parseBold(content);
}

function buildSections(
  article: Article,
): Array<ArticleSection & { icon?: ReactNode }> {
  const flexibleSections = (article.sections || []).map((section) => ({
    ...section,
    images: section.images || [],
  }));

  const aboutUpdateSection =
    article.aboutUpdate &&
    !flexibleSections.some((section) => {
      const normalizedTitle =
        `${section.title || ""} ${section.id || ""}`.toLowerCase();
      return (
        normalizedTitle.includes("about the update") ||
        normalizedTitle.includes("aboutupdate")
      );
    })
      ? [
          {
            id: "aboutUpdate",
            title: "About The Update",
            content: article.aboutUpdate,
            images: article.images?.aboutUpdate || [],
          } satisfies ArticleSection & { icon?: ReactNode },
        ]
      : [];

  if (flexibleSections.length > 0) {
    return [...aboutUpdateSection, ...flexibleSections];
  }

  return [...aboutUpdateSection, ...legacySectionMeta]
    .map((meta) => {
      const content = (article as Article & Record<string, unknown>)[meta.id];
      if (!content) return null;

      return {
        id: meta.id,
        title: meta.title,
        icon: "icon" in meta ? meta.icon : undefined,
        content: content as string | string[],
        images: article.images?.[meta.id] || [],
      };
    })
    .filter(Boolean) as Array<ArticleSection & { icon?: ReactNode }>;
}

type CommentTreeNode = ArticleComment & { replies: CommentTreeNode[] };

type CommentNodeViewProps = {
  node: CommentTreeNode;
  depth?: number;
  replyToId: string | null;
  expandedReplies: Record<string, boolean>;
  replyAnonymous: boolean;
  replyName: string;
  replyContent: string;
  onToggleReply: (id: string | null) => void;
  onToggleReplies: (id: string) => void;
  onReplyAnonymousChange: (value: boolean) => void;
  onReplyNameChange: (value: string) => void;
  onReplyContentChange: (value: string) => void;
  onSubmitReply: (parentId: string) => void;
  onCancelReply: () => void;
};

function buildCommentTree(comments: ArticleComment[]) {
  const byId = new Map<string, CommentTreeNode>();
  const roots: CommentTreeNode[] = [];

  comments.forEach((comment) => {
    byId.set(comment.id, { ...comment, replies: [] });
  });

  byId.forEach((comment) => {
    if (comment.parentId && byId.has(comment.parentId)) {
      byId.get(comment.parentId)?.replies.push(comment);
    } else {
      roots.push(comment);
    }
  });

  return roots;
}

function sortTree(nodes: CommentTreeNode[]): CommentTreeNode[] {
  return nodes
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((node) => ({
      ...node,
      replies: sortTree(node.replies),
    }));
}

function CommentNodeView({
  node,
  depth = 0,
  replyToId,
  expandedReplies,
  replyAnonymous,
  replyName,
  replyContent,
  onToggleReply,
  onToggleReplies,
  onReplyAnonymousChange,
  onReplyNameChange,
  onReplyContentChange,
  onSubmitReply,
  onCancelReply,
}: CommentNodeViewProps) {
  const isReplying = replyToId === node.id;
  const hasReplies = node.replies.length > 0;
  const repliesExpanded = expandedReplies[node.id] ?? false;
  const initials = (node.anonymous ? "A" : node.name || "G")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div
      className={depth === 0 ? "relative pl-14 pb-6" : "relative pl-14 pb-4"}
    >
      <div
        className="absolute left-5 top-0 h-full border-l border-border/70"
        aria-hidden="true"
      />
      <div className="absolute left-0 top-0 h-10 w-10 overflow-hidden rounded-full border border-border bg-muted text-foreground flex items-center justify-center shadow-sm">
        <span className="text-sm font-semibold">{initials}</span>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-sm font-semibold text-foreground">
            {node.anonymous ? "Anonymous" : node.name || "Guest"}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatRelativeDate(node.createdAt)}
          </p>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {node.content}
        </p>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => onToggleReply(isReplying ? null : node.id)}
            className="px-0 text-primary hover:bg-transparent"
          >
            <Reply className="h-3.5 w-3.5 mr-1" />
            Reply
          </Button>
          {hasReplies && (
            <button
              type="button"
              onClick={() => onToggleReplies(node.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary transition-colors"
            >
              {repliesExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {node.replies.length}{" "}
              {node.replies.length === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
      </div>

      {isReplying && (
        <div className="mt-4 ml-2 space-y-3 border-l border-border/70 pl-4">
          <div className="grid gap-3">
            <div className="flex items-center gap-2">
              <input
                id={`reply-anon-${node.id}`}
                type="checkbox"
                checked={replyAnonymous}
                onChange={(e) => onReplyAnonymousChange(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
              />
              <label
                htmlFor={`reply-anon-${node.id}`}
                className="text-xs text-muted-foreground"
              >
                Reply anonymously
              </label>
            </div>
            {!replyAnonymous && (
              <Input
                value={replyName}
                onChange={(e) => onReplyNameChange(e.target.value)}
                placeholder="Your name"
              />
            )}
            <Textarea
              value={replyContent}
              onChange={(e) => onReplyContentChange(e.target.value)}
              placeholder="Write a reply..."
              className="min-h-24"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => onSubmitReply(node.id)}
            >
              <Send className="h-4 w-4 mr-2" />
              Post Reply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onCancelReply}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {hasReplies && repliesExpanded && (
        <div className="mt-4 space-y-4 pl-1">
          {node.replies.map((reply) => (
            <CommentNodeView
              key={reply.id}
              node={reply}
              depth={depth + 1}
              replyToId={replyToId}
              expandedReplies={expandedReplies}
              replyAnonymous={replyAnonymous}
              replyName={replyName}
              replyContent={replyContent}
              onToggleReply={onToggleReply}
              onToggleReplies={onToggleReplies}
              onReplyAnonymousChange={onReplyAnonymousChange}
              onReplyNameChange={onReplyNameChange}
              onReplyContentChange={onReplyContentChange}
              onSubmitReply={onSubmitReply}
              onCancelReply={onCancelReply}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ArticlePage() {
  const { slug } = useParams();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [isMobileDrawer, setIsMobileDrawer] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [commentName, setCommentName] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyName, setReplyName] = useState("");
  const [replyContent, setReplyContent] = useState("");
  const [replyAnonymous, setReplyAnonymous] = useState(true);
  const [expandedReplies, setExpandedReplies] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    async function fetchArticle() {
      try {
        const res = await fetch(`/api/articles/${slug}`);
        const data = await res.json();
        if (data.article) {
          setArticle(data.article);
        }
      } catch (e) {
        console.error("Failed to fetch article:", e);
      } finally {
        setLoading(false);
      }
    }
    fetchArticle();
  }, [slug]);

  useEffect(() => {
    const timer = window.setTimeout(() => setBrokenImages({}), 0);
    return () => window.clearTimeout(timer);
  }, [slug]);

  useEffect(() => {
    const updateIsMobile = () => setIsMobileDrawer(window.innerWidth < 768);

    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  useEffect(() => {
    async function fetchComments() {
      try {
        setCommentsLoading(true);
        const res = await fetch(
          `/api/comments?slug=${encodeURIComponent(String(slug))}`,
        );
        const data = await res.json();
        if (Array.isArray(data.comments)) {
          setComments(data.comments);
        } else {
          setComments([]);
        }
      } catch (error) {
        console.error("Failed to fetch comments:", error);
        setComments([]);
      } finally {
        setCommentsLoading(false);
      }
    }

    fetchComments();
  }, [slug]);

  const commentTree = useMemo(
    () => sortTree(buildCommentTree(comments)),
    [comments],
  );

  async function submitComment(parentId: string | null = null) {
    const content = parentId ? replyContent.trim() : commentContent.trim();
    const name = parentId ? replyName.trim() : commentName.trim();
    const isAnonymous = parentId ? replyAnonymous : anonymous;

    if (!content) return;

    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleSlug: article?.slug,
        parentId,
        content,
        name,
        anonymous: isAnonymous,
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to post comment");
    }

    const data = await res.json();
    if (data.comment) {
      setComments((current) => [...current, data.comment]);
      if (parentId) {
        setReplyContent("");
        setReplyName("");
        setReplyAnonymous(true);
        setReplyToId(null);
      } else {
        setCommentContent("");
        setCommentName("");
        setAnonymous(true);
      }
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        <Skeleton className="h-8 w-32 bg-card" />
        <Skeleton className="h-16 w-full bg-card" />
        <Skeleton className="h-4 w-1/4 bg-card" />
        <Skeleton className="h-[200px] w-full bg-card" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-24 text-center">
        <h1 className="text-3xl font-bold mb-4">Article Not Found</h1>
        <p className="text-muted-foreground mb-8">
          It might have been removed or doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="text-primary hover:underline inline-flex items-center gap-2 text-lg"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </Link>
      </div>
    );
  }

  const sections = buildSections(article);
  const referenceUrl =
    typeof article.sourceUrl === "string" ? article.sourceUrl.trim() : "";

  return (
    <article className="mx-auto w-full max-w-[96rem] px-4 sm:px-6 lg:px-8 py-12 pb-24 xl:pr-[19rem] 2xl:pr-[17rem]">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Badge className="bg-primary/20 text-primary border-primary/20 hover:bg-primary/30 text-sm px-3 py-1">
            {article.category}
          </Badge>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="w-4 h-4" />
            {formatLongDate(article.publishedAt)}
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6 leading-tight font-heading">
          {article.title}
        </h1>

        {article.summary && (
          <div className="mb-12 max-w-6xl 2xl:max-w-[72rem] p-6 bg-primary/5 border border-primary/10 rounded-xl shadow-sm">
            <p className="text-xl md:text-2xl text-foreground font-medium italic leading-relaxed text-justify">
              &ldquo;{article.summary}&rdquo;
            </p>
          </div>
        )}

        <div className="flex gap-2 flex-wrap mb-10">
          {(article.tags || []).map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="px-3 py-1 font-normal bg-card"
            >
              #{tag}
            </Badge>
          ))}
        </div>
      </motion.div>

      <div className="space-y-16">
        {sections.map((section) => {
          const sectionImages = section.images?.length
            ? section.images
            : article.images?.[section.id] || [];
          const visibleImages = sectionImages.filter(
            (imgUrl) => !brokenImages[imgUrl],
          );

          return (
            <motion.section
              key={section.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="w-full"
            >
              <div className="max-w-6xl 2xl:max-w-[72rem]">
                <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 border-b border-border/50 pb-2 mb-4 font-heading">
                  {section.icon}
                  {section.title}
                </h2>

                {section.subtitle && (
                  <p className="text-sm text-muted-foreground mb-4">
                    {section.subtitle}
                  </p>
                )}

                <div className="text-muted-foreground leading-relaxed whitespace-pre-line text-lg text-justify [hyphens:auto]">
                  {formatContent(section.content)}
                </div>
              </div>

              {visibleImages.length > 0 && (
                <div className="mt-6 flex flex-col items-center gap-4">
                  {visibleImages.map((imgUrl, imgIdx) => (
                    <div
                      key={imgIdx}
                      className="w-full max-w-3xl rounded-xl overflow-hidden border border-border bg-card/50 flex justify-center"
                    >
                      <img
                        src={imgUrl}
                        alt={`${section.title} visual ${imgIdx + 1}`}
                        className="max-h-80 w-auto object-contain p-3"
                        loading="lazy"
                        onError={() =>
                          setBrokenImages((current) => ({
                            ...current,
                            [imgUrl]: true,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </motion.section>
          );
        })}
      </div>

      {referenceUrl && (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16 pt-8 border-t border-border"
        >
          <a
            href={referenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-card hover:bg-muted border border-border rounded-lg transition-all font-medium text-foreground hover:shadow-md"
          >
            Read official announcement on AWS
            <ExternalLink className="w-4 h-4" />
          </a>
        </motion.div>
      )}

      <motion.aside
        initial={false}
        animate={{
          x: commentsOpen ? 0 : isMobileDrawer ? "100%" : "calc(100% - 3rem)",
        }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="fixed right-0 top-20 z-40 w-[22rem] max-w-[calc(100vw-1rem)]"
      >
        <button
          type="button"
          onClick={() => setCommentsOpen((current) => !current)}
          className="absolute -left-12 top-24 hidden h-24 w-12 items-center justify-center rounded-l-2xl border border-border bg-card text-primary shadow-xl shadow-black/30 md:flex"
          aria-label={commentsOpen ? "Close comments" : "Open comments"}
        >
          <MessageSquare className="h-5 w-5" />
        </button>

        <div className="h-[calc(100vh-6rem)] overflow-hidden rounded-l-2xl border border-border bg-card/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Comments</p>
              <p className="text-xs text-muted-foreground">
                {comments.length} discussion{comments.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setCommentsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex h-[calc(100%-3.5rem)] min-h-0 flex-col">
            <div className="border-b border-border px-4 py-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    id="top-anon"
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => setAnonymous(e.target.checked)}
                    className="h-4 w-4 rounded border-border bg-background text-primary focus:ring-primary"
                  />
                  <label
                    htmlFor="top-anon"
                    className="text-xs text-muted-foreground"
                  >
                    Comment anonymously
                  </label>
                </div>
                {!anonymous && (
                  <Input
                    value={commentName}
                    onChange={(e) => setCommentName(e.target.value)}
                    placeholder="Your name"
                  />
                )}
                <Textarea
                  value={commentContent}
                  onChange={(e) => setCommentContent(e.target.value)}
                  placeholder="Write a comment..."
                  className="min-h-24"
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      if (!article) return;
                      await submitComment(null);
                    }}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Post Comment
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCommentContent("");
                      setCommentName("");
                      setAnonymous(true);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            <div className="theme-scrollbar flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
              {commentsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full bg-muted" />
                  <Skeleton className="h-20 w-full bg-muted" />
                  <Skeleton className="h-20 w-full bg-muted" />
                </div>
              ) : commentTree.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/50 p-6 text-sm text-muted-foreground">
                  No comments yet. Start the discussion on this post.
                </div>
              ) : (
                <div className="space-y-4">
                  {commentTree.map((comment) => (
                    <CommentNodeView
                      key={comment.id}
                      node={comment}
                      replyToId={replyToId}
                      expandedReplies={expandedReplies}
                      replyAnonymous={replyAnonymous}
                      replyName={replyName}
                      replyContent={replyContent}
                      onToggleReply={setReplyToId}
                      onToggleReplies={(id) =>
                        setExpandedReplies((current) => ({
                          ...current,
                          [id]: !current[id],
                        }))
                      }
                      onReplyAnonymousChange={setReplyAnonymous}
                      onReplyNameChange={setReplyName}
                      onReplyContentChange={setReplyContent}
                      onSubmitReply={submitComment}
                      onCancelReply={() => setReplyToId(null)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.aside>

      <button
        type="button"
        onClick={() => setCommentsOpen((current) => !current)}
        className="fixed right-0 top-1/2 z-40 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-l-2xl border border-border bg-card text-primary shadow-xl shadow-black/30 md:hidden"
        aria-label={commentsOpen ? "Close comments" : "Open comments"}
      >
        <MessageSquare className="h-5 w-5" />
      </button>
    </article>
  );
}
