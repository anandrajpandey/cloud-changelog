"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Image as ImageIcon,
  Send,
  Loader2,
  Edit3,
  Plus,
  ExternalLink,
  Trash2,
  Terminal,
  LogOut,
  UserCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { Article, ArticleComment } from "@/lib/dynamodb";
import { formatShortDate, isValidDate } from "@/lib/date";

type SectionDraft = {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  images: string[];
};

type AccessFormData = {
  title: string;
  category: string;
  sourceUrl: string;
  summary: string;
  sections: SectionDraft[];
};

type TranscriptLine =
  | { kind: "system"; text: string }
  | { kind: "command"; text: string }
  | { kind: "error"; text: string }
  | { kind: "success"; text: string };

type AdminMetrics = {
  totalLandings: number;
  averageTimeSpentSeconds: number;
  totalComments: number;
};

const LOGIN_SEQUENCE = [
  { command: "whoami" },
  { command: "pwd" },
  { command: "ls" },
  { command: "cat manifest.txt" },
  { command: "sudo -i" },
];

const createSection = (
  overrides: Partial<SectionDraft> = {},
): SectionDraft => ({
  id: crypto.randomUUID(),
  title: "",
  subtitle: "",
  content: "",
  images: [],
  ...overrides,
});

const emptyFormData = (): AccessFormData => ({
  title: "",
  category: "System Architecture Deep Dive",
  sourceUrl: "",
  summary: "",
  sections: [
    createSection({ title: "Section Title", subtitle: "Optional subtitle" }),
  ],
});

const articleToSections = (article: Article): SectionDraft[] => {
  if (article.sections?.length) {
    return article.sections.map((section, index) =>
      createSection({
        id: section.id || `section-${index + 1}`,
        title: section.title || `Section ${index + 1}`,
        subtitle: section.subtitle || "",
        content: Array.isArray(section.content)
          ? section.content.join("\n")
          : section.content || "",
        images: section.images || article.images?.[section.id] || [],
      }),
    );
  }

  const legacySections = [
    { id: "whatsNew", title: "What's New", content: article.whatsNew },
    {
      id: "aboutUpdate",
      title: "About the Update",
      content: article.aboutUpdate,
    },
    {
      id: "whyItMatters",
      title: "Why It Matters",
      content: article.whyItMatters,
    },
    { id: "impact", title: "Impact", content: article.impact },
    {
      id: "beforeAfter",
      title: "Before vs After",
      content: article.beforeAfter,
    },
    { id: "useCases", title: "Practical Use Cases", content: article.useCases },
    {
      id: "keyTakeaways",
      title: "Key Takeaways",
      content: article.keyTakeaways,
    },
  ];

  const mapped = legacySections
    .filter((section) => section.content)
    .map((section) =>
      createSection({
        id: section.id,
        title: section.title,
        subtitle: "",
        content: Array.isArray(section.content)
          ? section.content.join("\n")
          : String(section.content || ""),
        images: article.images?.[section.id] || [],
      }),
    );

  return mapped.length > 0
    ? mapped
    : [
        createSection({
          title: "Section Title",
          subtitle: "Optional subtitle",
        }),
      ];
};

const sectionsToImagesMap = (sections: SectionDraft[]) =>
  sections.reduce<Record<string, string[]>>((acc, section) => {
    if (section.images.length > 0) {
      acc[section.id] = section.images;
    }
    return acc;
  }, {});

const normalizeCommand = (value: string) => value.trim().replace(/\s+/g, " ");

export default function AdminPage() {
  const [authState, setAuthState] = useState<
    "checking" | "locked" | "unlocked"
  >("checking");
  const [terminalInput, setTerminalInput] = useState("");
  const [transcript, setTranscript] = useState<TranscriptLine[]>([
    { kind: "system", text: "IncentiveX access terminal initialized." },
    {
      kind: "system",
      text: "Enter the command sequence to unlock the editor.",
    },
  ]);
  const [loginStep, setLoginStep] = useState(0);
  const [loginCommands, setLoginCommands] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedArticleSlug, setSelectedArticleSlug] = useState("");
  const [articleComments, setArticleComments] = useState<ArticleComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [metrics, setMetrics] = useState<AdminMetrics>({
    totalLandings: 0,
    averageTimeSpentSeconds: 0,
    totalComments: 0,
  });
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AccessFormData>(emptyFormData);

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch("/api/admin/session");
        const data = await res.json();
        if (data.authenticated) {
          setAuthState("unlocked");
          setIsAuthenticated(true);
        } else {
          setAuthState("locked");
        }
      } catch {
        setAuthState("locked");
      }
    }

    checkSession();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    fetch("/api/articles")
      .then((res) => res.json())
      .then((data) => {
        if (data.articles) {
          setArticles(data.articles);
          setSelectedArticleSlug(
            (current) => current || data.articles?.[0]?.slug || "",
          );
        }
      });
  }, [isAuthenticated, success]);

  useEffect(() => {
    if (!isAuthenticated || !selectedArticleSlug) return;

    async function fetchComments() {
      try {
        setCommentsLoading(true);
        const res = await fetch(
          `/api/comments?slug=${encodeURIComponent(selectedArticleSlug)}`,
        );
        const data = await res.json();
        setArticleComments(Array.isArray(data.comments) ? data.comments : []);
      } catch (error) {
        console.error("Failed to load article comments", error);
        setArticleComments([]);
      } finally {
        setCommentsLoading(false);
      }
    }

    fetchComments();
  }, [isAuthenticated, selectedArticleSlug]);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function fetchMetrics() {
      try {
        setMetricsLoading(true);
        const res = await fetch("/api/admin/metrics");
        const data = await res.json();
        setMetrics({
          totalLandings: Number(data.totalLandings || 0),
          averageTimeSpentSeconds: Number(data.averageTimeSpentSeconds || 0),
          totalComments: Number(data.totalComments || 0),
        });
      } catch (error) {
        console.error("Failed to load metrics", error);
      } finally {
        setMetricsLoading(false);
      }
    }

    fetchMetrics();
  }, [isAuthenticated, success]);

  const resetForm = () => {
    setEditingId(null);
    setFormData(emptyFormData());
  };

  const handleLoginCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const command = normalizeCommand(terminalInput);
    if (!command) return;

    const expected = LOGIN_SEQUENCE[loginStep];
    setTranscript((current) => [
      ...current,
      { kind: "command", text: `$ ${command}` },
    ]);
    setTerminalInput("");

    if (!expected || command !== expected.command) {
      setTranscript((current) => [
        ...current,
        {
          kind: "error",
          text: "bash: permission denied: command sequence invalid",
        },
        { kind: "system", text: "Sequence reset. Start over." },
      ]);
      setLoginStep(0);
      setLoginCommands([]);
      return;
    }

    const nextCommands = [...loginCommands, command];
    setLoginCommands(nextCommands);
    setTranscript((current) => [
      ...current,
      { kind: "system", text: "command accepted" },
    ]);

    if (loginStep === LOGIN_SEQUENCE.length - 1) {
      try {
        const res = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commands: nextCommands }),
        });

        if (!res.ok) {
          throw new Error("Login failed");
        }

        setTranscript((current) => [
          ...current,
          { kind: "success", text: "access granted" },
          { kind: "system", text: "Loading the editor shell..." },
        ]);
        setAuthState("unlocked");
        setIsAuthenticated(true);
      } catch (error) {
        console.error(error);
        setTranscript((current) => [
          ...current,
          { kind: "error", text: "login rejected by server" },
          { kind: "system", text: "Sequence reset. Start over." },
        ]);
        setLoginStep(0);
        setLoginCommands([]);
      }
      return;
    }

    setLoginStep((step) => step + 1);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      setIsAuthenticated(false);
      setAuthState("locked");
      setEditingId(null);
      setArticles([]);
      resetForm();
      setLoginStep(0);
      setLoginCommands([]);
      setTranscript([
        {
          kind: "system",
          text: "IncentiveX access terminal initialized.",
        },
        {
          kind: "system",
          text: "Enter the command sequence to unlock the editor.",
        },
      ]);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const method = editingId ? "PUT" : "POST";
      const payload = {
        ...formData,
        sections: formData.sections,
        images: sectionsToImagesMap(formData.sections),
        id: editingId,
      };

      const res = await fetch("/api/articles/custom", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save");

      setSuccess(true);
      resetForm();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (article: Article) => {
    setEditingId(article.id);
    setFormData({
      title: article.title || "",
      category: article.category || "System Architecture Deep Dive",
      sourceUrl: article.sourceUrl || "",
      summary: article.summary || "",
      sections: articleToSections(article),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (article: Article) => {
    const confirmed = window.confirm(
      `Delete "${article.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      const res = await fetch("/api/articles/custom", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: article.id }),
      });

      if (!res.ok) throw new Error("Failed to delete");

      setArticles((current) =>
        current.filter((item) => item.id !== article.id),
      );
      if (editingId === article.id) {
        resetForm();
      }
    } catch (error) {
      console.error(error);
      alert("Unable to delete the article right now.");
    }
  };

  const handleDeleteComment = async (comment: ArticleComment) => {
    const confirmed = window.confirm(
      "Delete this comment and its reply thread?",
    );
    if (!confirmed) return;

    try {
      const res = await fetch(
        `/api/comments/${comment.id}?slug=${encodeURIComponent(selectedArticleSlug)}`,
        { method: "DELETE" },
      );

      if (!res.ok) throw new Error("Failed to delete comment");

      setArticleComments((current) =>
        current.filter(
          (item) => item.id !== comment.id && item.parentId !== comment.id,
        ),
      );
      const refresh = await fetch(
        `/api/comments?slug=${encodeURIComponent(selectedArticleSlug)}`,
      );
      const data = await refresh.json();
      setArticleComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (error) {
      console.error(error);
      alert("Unable to delete the comment right now.");
    }
  };

  const addSection = () => {
    setFormData((prev) => ({
      ...prev,
      sections: [
        ...prev.sections,
        createSection({ title: "New Section", subtitle: "Optional subtitle" }),
      ],
    }));
  };

  const updateSection = (
    sectionId: string,
    field: keyof SectionDraft,
    value: string | string[],
  ) => {
    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId ? { ...section, [field]: value } : section,
      ),
    }));
  };

  const addImageToSection = (sectionId: string) => {
    const url = window.prompt("Enter Image URL:");
    if (!url) return;

    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? { ...section, images: [...section.images, url] }
          : section,
      ),
    }));
  };

  const removeImage = (sectionId: string, imageIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      sections: prev.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              images: section.images.filter((_, index) => index !== imageIndex),
            }
          : section,
      ),
    }));
  };

  const removeSection = (sectionId: string) => {
    setFormData((prev) => {
      if (prev.sections.length === 1) return prev;
      return {
        ...prev,
        sections: prev.sections.filter((section) => section.id !== sectionId),
      };
    });
  };

  if (authState !== "unlocked") {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-border bg-black/95 shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between gap-4 border-b border-border bg-[#090909] px-4 py-3">
            <div className="flex items-center gap-3">
              <Terminal className="h-4 w-4 text-primary" />
              <div>
                <p className="font-mono text-sm text-foreground">
                  cloud-changelog@access
                </p>
                <p className="text-xs text-muted-foreground">
                  restricted shell session
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              secure login
            </div>
          </div>

          <div className="px-4 py-5 font-mono text-sm leading-6 text-green-300 min-h-[420px] bg-black">
            {transcript.map((line, index) => (
              <div
                key={index}
                className={
                  line.kind === "error"
                    ? "text-red-400"
                    : line.kind === "success"
                      ? "text-green-400"
                      : line.kind === "command"
                        ? "text-foreground"
                        : "text-green-300"
                }
              >
                {line.kind === "command" ? (
                  <span>
                    <span className="text-primary">root@cloud-changelog</span>
                    <span className="text-muted-foreground">:</span>
                    <span className="text-cyan-300">~/access</span>
                    <span className="text-muted-foreground">$</span>{" "}
                    {line.text.slice(2)}
                  </span>
                ) : (
                  line.text
                )}
              </div>
            ))}
            <form
              onSubmit={handleLoginCommand}
              className="mt-4 flex items-center gap-2"
            >
              <span className="text-primary">root@cloud-changelog</span>
              <span className="text-muted-foreground">:</span>
              <span className="text-cyan-300">~/access</span>
              <span className="text-muted-foreground">$</span>
              <Input
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="border-0 bg-transparent p-0 text-foreground shadow-none focus-visible:ring-0 font-mono h-auto"
                placeholder="enter command"
              />
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8 gap-4 flex-wrap rounded-2xl border border-border bg-card px-5 py-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground font-mono">
            {editingId ? "Edit Custom Blog" : "Publish Custom Blog"}
          </h1>
          <p className="text-muted-foreground mt-1">
            Build the story with only the sections it needs. Rename, subtitle,
            add, or remove containers freely.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleLogout}
            className="flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" /> Logout
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          onSubmit={handlePublish}
          className="space-y-8 bg-card border border-border p-8 rounded-2xl shadow-sm"
        >
          <div className="space-y-2">
            <Label htmlFor="title" className="text-base">
              Article Title
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              placeholder="e.g. How Netflix Scaled on AWS"
              className="text-lg py-6"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="category" className="text-base">
                Category
              </Label>
              <select
                id="category"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
              >
                <option value="AWS Update">AWS Update</option>
                <option value="System Architecture">
                  System Architecture Deep Dive
                </option>
                <option value="Companies">Company Spotlight</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="sourceUrl"
                className="text-base flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" /> Reference URL
              </Label>
              <Input
                id="sourceUrl"
                type="url"
                value={formData.sourceUrl}
                onChange={(e) =>
                  setFormData({ ...formData, sourceUrl: e.target.value })
                }
                placeholder="https://aws.amazon.com/..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="summary" className="text-base">
              Summary
            </Label>
            <Textarea
              id="summary"
              value={formData.summary}
              onChange={(e) =>
                setFormData({ ...formData, summary: e.target.value })
              }
              placeholder="Short summary shown on the feed card"
              className="min-h-[100px] resize-y"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap border-b border-border/50 pb-2">
              <Label className="text-xl font-bold font-mono">Sections</Label>
              <Button
                type="button"
                variant="outline"
                onClick={addSection}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Section
              </Button>
            </div>

            <div className="space-y-5">
              {formData.sections.map((section, index) => (
                <div
                  key={section.id}
                  className="space-y-4 p-4 bg-muted/30 rounded-xl border border-border/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="grid gap-3 flex-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                          {index + 1}
                        </span>
                        Section
                      </div>
                      <Input
                        value={section.title}
                        onChange={(e) =>
                          updateSection(section.id, "title", e.target.value)
                        }
                        placeholder="Section title"
                      />
                      <Input
                        value={section.subtitle}
                        onChange={(e) =>
                          updateSection(section.id, "subtitle", e.target.value)
                        }
                        placeholder="Subtitle or short lead-in"
                      />
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addImageToSection(section.id)}
                        className="whitespace-nowrap"
                      >
                        <ImageIcon className="w-4 h-4 mr-2" /> Add Image
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSection(section.id)}
                        disabled={formData.sections.length === 1}
                        className="whitespace-nowrap text-muted-foreground"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    </div>
                  </div>

                  <Textarea
                    value={section.content}
                    onChange={(e) =>
                      updateSection(section.id, "content", e.target.value)
                    }
                    placeholder="Write the container content here..."
                    className="min-h-[140px] resize-y"
                  />

                  {section.images.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-4 pt-2">
                      {section.images.map((img, i) => (
                        <div
                          key={i}
                          className="relative w-full max-w-xs overflow-hidden rounded-lg border border-border bg-black/70"
                        >
                          <img
                            src={img}
                            alt={`${section.title || "Section"} image ${i + 1}`}
                            className="h-36 w-full object-contain p-3"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="absolute top-2 right-2"
                            onClick={() => removeImage(section.id, i)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full font-semibold text-lg h-14"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Publishing
                Database Entry...
              </>
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" /> Publish to Live Feed
              </>
            )}
          </Button>

          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-green-500/10 text-green-500 border border-green-500/20 rounded-lg text-center font-medium"
            >
              Successfully {editingId ? "updated" : "published"}! The blog is
              now live on the platform.
            </motion.div>
          )}
        </motion.form>

        <aside className="space-y-6 self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold font-mono mb-4">
              Site Metrics
            </h3>
            {metricsLoading ? (
              <div className="space-y-3">
                <div className="h-20 rounded-xl bg-muted/50 animate-pulse" />
                <div className="h-20 rounded-xl bg-muted/50 animate-pulse" />
                <div className="h-20 rounded-xl bg-muted/50 animate-pulse" />
              </div>
            ) : (
              <div className="grid gap-3">
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Landings
                  </p>
                  <p className="mt-2 text-2xl font-bold text-foreground">
                    {metrics.totalLandings}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    People who landed on the site
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Avg Time
                  </p>
                  <p className="mt-2 text-2xl font-bold text-foreground">
                    {Math.max(
                      0,
                      Math.round(metrics.averageTimeSpentSeconds / 60),
                    )}
                    m {Math.max(0, metrics.averageTimeSpentSeconds % 60)}s
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Average session duration
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-background/60 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Comments
                  </p>
                  <p className="mt-2 text-2xl font-bold text-foreground">
                    {metrics.totalComments}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total comments across posts
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-lg font-semibold mb-2">
              Selected Post Comments
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Use this panel to moderate the current article&apos;s discussion
              thread.
            </p>
            <div className="mb-4">
              <Label htmlFor="comment-post" className="text-sm mb-2 block">
                Post
              </Label>
              <select
                id="comment-post"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedArticleSlug}
                onChange={(e) => setSelectedArticleSlug(e.target.value)}
              >
                {articles.map((article) => (
                  <option key={article.id} value={article.slug}>
                    {article.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="max-h-[28rem] overflow-y-auto space-y-3 pr-1 theme-scrollbar">
              {commentsLoading ? (
                <div className="space-y-3">
                  <div className="h-16 rounded-xl bg-muted/50 animate-pulse" />
                  <div className="h-16 rounded-xl bg-muted/50 animate-pulse" />
                  <div className="h-16 rounded-xl bg-muted/50 animate-pulse" />
                </div>
              ) : articleComments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No comments for this post yet.
                </p>
              ) : (
                articleComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="flex items-start justify-between gap-4 border-b border-border/70 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {comment.anonymous
                          ? "Anonymous"
                          : comment.name || "Guest"}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          {comment.parentId ? "reply" : "comment"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {comment.content}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteComment(comment)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        <div className="mt-16 xl:col-span-2">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-bold tracking-tight font-mono">
              Manage Existing Articles
            </h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserCheck className="w-4 h-4" />
              session active
            </div>
          </div>
          <div className="grid gap-4">
            {articles.map((article) => (
              <div
                key={article.id}
                className="flex items-center justify-between gap-4 p-4 bg-card border border-border rounded-xl"
              >
                <div>
                  <h3 className="font-semibold text-lg font-mono">
                    {article.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {article.category}
                    {isValidDate(article.publishedAt) ? ` - ${formatShortDate(article.publishedAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => handleEdit(article)}
                    className="flex items-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(article)}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
