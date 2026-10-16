import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Sparkles, Send, Copy, Languages } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/page-header";
import { motion } from "framer-motion";


export default function AIGeneratorPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [topic, setTopic] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("english");
  const [category, setCategory] = useState("news");

  // Define mutation for generating content
  const generateMutation = useMutation({
    mutationFn: async (data: { topic: string; imageContext?: string; language: string }) => {
      const res = await apiRequest("POST", "/api/ai/generate", data);
      return res.json();
    },
    onSuccess: (data) => {
      setGeneratedContent(data.content);
      toast({
        title: t("ai_generator.toast_generated"),
        description: t("ai_generator.toast_generated_desc"),
      });
    },
    onError: (error) => {
      toast({
        title: t("ai_gen_errors.generation_failed"),
        description: error.message || t("ai_gen_errors.generic"),
        variant: "destructive",
      });
    },
  });

  // Define mutation for posting content
  const postMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("content", generatedContent);
      formData.append("category", category); // Use selected category
      if (selectedFile && category !== "discussion") {
        formData.append("file", selectedFile);
      }

      const res = await apiRequest("POST", "/api/posts", formData);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t("ai_generator.toast_posted"),
        description: t("ai_generator.toast_posted_desc"),
      });
      // Redirect based on category
      if (category === "discussion") {
        setLocation("/post/discussions");
      } else {
        setLocation("/feed/media");
      }
    },
    onError: (error) => {
      toast({
        title: t("ai_gen_errors.posting_failed"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = () => {
    if (!topic) {
      toast({
        title: t("ai_gen_errors.topic_required"),
        description: t("ai_gen_errors.topic_missing"),
        variant: "destructive",
      });
      return;
    }

    generateMutation.mutate({
      topic,
      imageContext: imagePreview || undefined,
      language,
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent);
    toast({
      title: t("ai_gen_errors.copied"),
      description: t("ai_gen_errors.copied_desc"),
    });
  };

  return (
    <div className="min-h-screen bg-transparent pb-20">
      <div className="container max-w-2xl mx-auto px-4">
        <PageHeader
          eyebrow={t("ai_generator.eyebrow", "Create / AI generator")}
          title={t("ai_generator.title")}
          description={t("ai_generator.description")}
          className="mb-8"
        />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <Card className="w-full overflow-hidden">
            <CardHeader className="ov-rule flex-row items-center gap-4 space-y-0 p-6">
              <img
                src="/ai-mascot.png"
                alt={t("ai_generator.mascot_alt", "Mecha Osiris, the AI mascot")}
                className="h-20 w-20 md:h-24 md:w-24 shrink-0 object-contain"
              />
              <div className="min-w-0 space-y-2">
                <h2 className="font-display text-xl font-semibold text-primary">
                  {t("ai_gen_errors.mascot_name")}
                </h2>
                <span className="ov-chip ov-chip-primary ov-data">
                  {t("ai_gen_errors.mascot_version")}
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Feed Selection */}
                  <div className="space-y-3">
                    <label className="ov-label">
                      {t("ai_generator.select_feed")}
                    </label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder={t("ai_generator.select_feed")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="news">{t("ai_generator.feeds.news")}</SelectItem>
                        <SelectItem value="entertainment">
                          {t("ai_generator.feeds.entertainment")}
                        </SelectItem>
                        <SelectItem value="discussion">
                          {t("ai_generator.feeds.discussion")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Language Selection */}
                  <div className="space-y-3">
                    <label className="ov-label flex items-center gap-2">
                      <Languages className="w-3 h-3" />
                      {t("ai_generator.select_language")}
                    </label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder={t("ai_generator.select_language")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="english">{t("ai_generator.languages.english")}</SelectItem>
                        <SelectItem value="german">{t("ai_generator.languages.german")}</SelectItem>
                        <SelectItem value="spanish">{t("ai_generator.languages.spanish")}</SelectItem>
                        <SelectItem value="french">{t("ai_generator.languages.french")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Image Upload - Hidden for Discussion */}
                {category !== "discussion" && (
                  <div className="space-y-3">
                    <label className="ov-label">{t("ai_generator.upload_image")}</label>
                    <div className="flex items-center gap-4">
                      <div className="relative w-full">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="cursor-pointer h-12 py-1.5 file:mr-4 file:h-8 file:rounded-pill file:border-0 file:bg-primary/10 file:px-3 file:text-xs file:font-semibold file:text-primary"
                        />
                      </div>
                    </div>
                    {imagePreview && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-4 relative ov-cut-2 overflow-hidden aspect-video w-full bg-muted"
                      >
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="object-cover w-full h-full"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute top-3 right-3"
                          onClick={() => {
                            setImagePreview(null);
                            setSelectedFile(null);
                          }}
                        >
                          {t("ai_generator.remove_image")}
                        </Button>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="ov-label">{t("ai_generator.enter_topic")}</label>
                <Input
                  placeholder={t("ai_generator.topic_placeholder")}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="h-12 px-4"
                />
              </div>

              <Button
                size="lg"
                className="w-full h-12"
                onClick={handleGenerate}
                disabled={generateMutation.isPending || !topic}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t("ai_generator.generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    {t("ai_generator.generate_button")}
                  </>
                )}
              </Button>

              {generatedContent && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8 space-y-4 pt-8 border-t border-border"
                >
                  <div className="flex items-center justify-between">
                    <label className="ov-label text-primary">{t("ai_generator.generated_label")}</label>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                        <Copy className="h-3.5 w-3.5" />
                        {t("ai_generator.copy")}
                      </Button>
                    </div>
                  </div>

                  <Textarea
                    value={generatedContent}
                    onChange={(e) => setGeneratedContent(e.target.value)}
                    className="min-h-[200px] p-4 leading-relaxed"
                    placeholder={t("ai_generator.edit_placeholder")}
                  />

                  <div className="flex gap-4 pt-2">
                    <Button
                      size="lg"
                      className="w-full h-12"
                      variant="default"
                      onClick={() => postMutation.mutate()}
                      disabled={postMutation.isPending}
                    >
                      {postMutation.isPending ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          {t("ai_generator.posting")}
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5" />
                          {t("ai_generator.post_button")}
                        </>
                      )}
                    </Button>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
