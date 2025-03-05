import { UploadButton } from "@uploadthing/react";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { OurFileRouter } from "@/lib/uploadthing";

interface ImageUploadProps {
  onUploadComplete: (url: string) => void;
}

export function ImageUpload({ onUploadComplete }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);

  return (
    <UploadButton<OurFileRouter, void>
      endpoint="imageUploader"
      onUploadBegin={() => {
        setIsUploading(true);
      }}
      onClientUploadComplete={(res) => {
        setIsUploading(false);
        if (res?.[0]?.url) {
          onUploadComplete(res[0].url);
          toast({
            title: "Success",
            description: "Image uploaded successfully",
          });
        }
      }}
      onUploadError={(error: Error) => {
        setIsUploading(false);
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      }}
      appearance={{
        button: "px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity",
        allowedContent: "text-sm text-muted-foreground mt-1",
      }}
    />
  );
}