import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Sparkles, Send, Copy, Languages } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
    <div className="min-h-screen bg-transparent pt-20 pb-20">
      <div className="container max-w-2xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <Card className="w-full glass-premium border-white/10 shadow-2xl overflow-hidden relative group">
            <div className="absolute inset-0 nebula-banner opacity-20 group-hover:opacity-30 transition-opacity duration-1000" />
            <div className="absolute inset-0 starfield opacity-10" />
            
            <CardHeader className="relative z-10 p-8 md:p-12 pb-4">
              <div className="flex flex-col items-center mb-10">
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  className="relative"
                >
                  <img
                    src="/ai-mascot.png"
                    alt="Mecha Osiris"
                    className="w-48 h-48 md:w-64 md:h-64 object-contain transition-all duration-700 drop-shadow-[0_0_30px_rgba(var(--primary),0.3)] group-hover:drop-shadow-[0_0_50px_rgba(var(--primary),0.5)]"
                  />
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-32 h-4 bg-primary/20 blur-xl rounded-full opacity-50" />
                </motion.div>
                <div className="mt-8 text-center space-y-2">
                  <h2 className="text-2xl font-black text-primary tracking-tighter uppercase italic">
                    {t("ai_gen_errors.mascot_name")}
                  </h2>
                  <Badge className="bg-primary/20 text-primary hover:bg-primary/30 border-none font-black text-[10px] uppercase tracking-widest px-4 h-7 rounded-full">
                    {t("ai_gen_errors.mascot_version")}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-6 border-t border-white/5">
                <div className="h-10 w-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-black tracking-tighter uppercase italic italic-primary">{t("ai_generator.title")}</CardTitle>
                  <CardDescription className="text-xs font-bold uppercase tracking-widest opacity-60">{t("ai_generator.description")}</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="relative z-10 p-8 md:p-12 pt-4 space-y-8">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Feed Selection */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">
                      {t("ai_generator.select_feed")}
                    </label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="glass-input h-12 rounded-2xl border-white/10 font-bold text-xs uppercase tracking-widest">
                        <SelectValue placeholder={t("ai_generator.select_feed")} />
                      </SelectTrigger>
                      <SelectContent className="glass-premium border-white/10">
                        <SelectItem value="news" className="font-bold text-xs uppercase tracking-widest">{t("ai_generator.feeds.news")}</SelectItem>
                        <SelectItem value="entertainment" className="font-bold text-xs uppercase tracking-widest">
                          {t("ai_generator.feeds.entertainment")}
                        </SelectItem>
                        <SelectItem value="discussion" className="font-bold text-xs uppercase tracking-widest">
                          {t("ai_generator.feeds.discussion")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Language Selection */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2 flex items-center gap-2">
                      <Languages className="w-3 h-3" />
                      {t("ai_generator.select_language")}
                    </label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger className="glass-input h-12 rounded-2xl border-white/10 font-bold text-xs uppercase tracking-widest">
                        <SelectValue placeholder={t("ai_generator.select_language")} />
                      </SelectTrigger>
                      <SelectContent className="glass-premium border-white/10">
                        <SelectItem value="english" className="font-bold text-xs uppercase tracking-widest">{t("ai_generator.languages.english")}</SelectItem>
                        <SelectItem value="german" className="font-bold text-xs uppercase tracking-widest">{t("ai_generator.languages.german")}</SelectItem>
                        <SelectItem value="spanish" className="font-bold text-xs uppercase tracking-widest">{t("ai_generator.languages.spanish")}</SelectItem>
                        <SelectItem value="french" className="font-bold text-xs uppercase tracking-widest">{t("ai_generator.languages.french")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Image Upload - Hidden for Discussion */}
                {category !== "discussion" && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">{t("ai_generator.upload_image")}</label>
                    <div className="flex items-center gap-4">
                      <div className="relative w-full">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="glass-input cursor-pointer h-14 rounded-3xl file:bg-primary/20 file:text-primary file:border-none file:rounded-full file:px-4 file:h-8 file:mt-2 file:mr-4 file:font-black file:text-[10px] file:uppercase file:tracking-widest"
                        />
                      </div>
                    </div>
                    {imagePreview && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-6 relative rounded-3xl overflow-hidden border border-white/10 aspect-video w-full shadow-2xl"
                      >
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="object-cover w-full h-full"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute top-4 right-4 rounded-full bg-black/50 backdrop-blur-xl border border-white/10 font-black text-[10px] uppercase tracking-widest hover:bg-black/70"
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
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/80 pl-2">{t("ai_generator.enter_topic")}</label>
                <Input
                  placeholder={t("ai_generator.topic_placeholder")}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="glass-input h-14 rounded-3xl px-6 font-bold"
                />
              </div>

              <Button
                className="w-full h-16 rounded-3xl font-black uppercase tracking-widest text-xs shadow-2xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95 nebula-glow"
                onClick={handleGenerate}
                disabled={generateMutation.isPending || !topic}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                    {t("ai_generator.generating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-3 h-5 w-5 stroke-[3px]" />
                    {t("ai_generator.generate_button")}
                  </>
                )}
              </Button>

              {generatedContent && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-12 space-y-6 pt-12 border-t border-white/5"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/80 pl-2">{t("ai_generator.generated_label")}</label>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={copyToClipboard} className="rounded-full font-black text-[10px] uppercase tracking-widest h-9 px-5 bg-white/5 hover:bg-white/10">
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        {t("ai_generator.copy")}
                      </Button>
                    </div>
                  </div>

                  <Textarea
                    value={generatedContent}
                    onChange={(e) => setGeneratedContent(e.target.value)}
                    className="glass-input min-h-[200px] rounded-[2rem] p-8 font-medium leading-relaxed border-primary/10"
                    placeholder={t("ai_generator.edit_placeholder")}
                  />

                  <div className="flex gap-4 pt-4">
                    <Button
                      className="w-full h-16 rounded-full font-black uppercase tracking-widest text-xs shadow-2xl shadow-primary/20 transition-all hover:-translate-y-1 active:scale-95 nebula-glow"
                      variant="default"
                      onClick={() => postMutation.mutate()}
                      disabled={postMutation.isPending}
                    >
                      {postMutation.isPending ? (
                        <>
                          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          {t("ai_generator.posting")}
                        </>
                      ) : (
                        <>
                          <Send className="mr-3 h-5 w-5 stroke-[3px]" />
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
