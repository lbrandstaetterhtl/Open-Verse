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

import { Navbar } from "@/components/layout/navbar";

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
                title: t('ai_generator.toast_generated'),
                description: t('ai_generator.toast_generated_desc'),
            });
        },
        onError: (error) => {
            toast({
                title: t('ai_gen_errors.generation_failed'),
                description: error.message || t('ai_gen_errors.generic'),
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
                title: t('ai_generator.toast_posted'),
                description: t('ai_generator.toast_posted_desc'),
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
                title: t('ai_gen_errors.posting_failed'),
                description: error.message,
                variant: "destructive",
            });
        }
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
                title: t('ai_gen_errors.topic_required'),
                description: t('ai_gen_errors.topic_missing'),
                variant: "destructive",
            });
            return;
        }

        generateMutation.mutate({
            topic,
            imageContext: imagePreview || undefined,
            language
        });
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedContent);
        toast({
            title: t('ai_gen_errors.copied'),
            description: t('ai_gen_errors.copied_desc'),
        });
    };

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container max-w-2xl mx-auto py-8 pt-24 px-4">
                <Card className="w-full">
                    <CardHeader>
                        <div className="flex flex-col items-center mb-6">
                            <img
                                src="/ai-mascot.png"
                                alt="Mecha Osiris"
                                className="w-64 h-64 object-contain hover:scale-105 transition-transform duration-300 drop-shadow-lg"
                            />
                            <h2 className="text-xl font-bold mt-2 text-primary tracking-wide">{t('ai_gen_errors.mascot_name')}</h2>
                            <Badge variant="outline" className="mt-1">{t('ai_gen_errors.mascot_version')}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-6 h-6 text-primary" />
                            <CardTitle>{t('ai_generator.title')}</CardTitle>
                        </div>
                        <CardDescription>
                            {t('ai_generator.description')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {/* Feed Selection */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        {t('ai_generator.select_feed')}
                                    </label>
                                    <Select value={category} onValueChange={setCategory}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('ai_generator.select_feed')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="news">{t('ai_generator.feeds.news')}</SelectItem>
                                            <SelectItem value="entertainment">{t('ai_generator.feeds.entertainment')}</SelectItem>
                                            <SelectItem value="discussion">{t('ai_generator.feeds.discussion')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Language Selection */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        <Languages className="w-4 h-4" />
                                        {t('ai_generator.select_language')}
                                    </label>
                                    <Select value={language} onValueChange={setLanguage}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('ai_generator.select_language')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="english">{t('ai_generator.languages.english')}</SelectItem>
                                            <SelectItem value="german">{t('ai_generator.languages.german')}</SelectItem>
                                            <SelectItem value="spanish">{t('ai_generator.languages.spanish')}</SelectItem>
                                            <SelectItem value="french">{t('ai_generator.languages.french')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Image Upload - Hidden for Discussion */}
                            {category !== "discussion" && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">{t('ai_generator.upload_image')}</label>
                                    <div className="flex items-center gap-4">
                                        <div className="relative w-full">
                                            <Input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageUpload}
                                                className="cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                    {imagePreview && (
                                        <div className="mt-4 relative rounded-lg overflow-hidden border aspect-video w-full">
                                            <img
                                                src={imagePreview}
                                                alt="Preview"
                                                className="object-cover w-full h-full"
                                            />
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                className="absolute top-2 right-2"
                                                onClick={() => {
                                                    setImagePreview(null);
                                                    setSelectedFile(null);
                                                }}
                                            >
                                                {t('ai_generator.remove_image')}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('ai_generator.enter_topic')}</label>
                            <Input
                                placeholder={t('ai_generator.topic_placeholder')}
                                value={topic}
                                onChange={(e) => setTopic(e.target.value)}
                            />
                        </div>

                        <Button
                            className="w-full"
                            onClick={handleGenerate}
                            disabled={generateMutation.isPending || !topic}
                        >
                            {generateMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('ai_generator.generating')}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-4 w-4" />
                                    {t('ai_generator.generate_button')}
                                </>
                            )}
                        </Button>

                        {generatedContent && (
                            <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium">{t('ai_generator.generated_label')}</label>
                                    <div className="flex gap-2">
                                        <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                                            <Copy className="h-4 w-4 mr-2" />
                                            {t('ai_generator.copy')}
                                        </Button>
                                    </div>
                                </div>

                                <Textarea
                                    value={generatedContent}
                                    onChange={(e) => setGeneratedContent(e.target.value)}
                                    className="min-h-[150px] font-medium"
                                    placeholder={t('ai_generator.edit_placeholder')}
                                />

                                <div className="flex gap-4 pt-4">
                                    <Button
                                        className="w-full"
                                        variant="default"
                                        onClick={() => postMutation.mutate()}
                                        disabled={postMutation.isPending}
                                    >
                                        {postMutation.isPending ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                {t('ai_generator.posting')}
                                            </>
                                        ) : (
                                            <>
                                                <Send className="mr-2 h-4 w-4" />
                                                {t('ai_generator.post_button')}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}

                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
