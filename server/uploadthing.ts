import { createUploadthing, type FileRouter } from "uploadthing/server";

const f = createUploadthing();

export const ourFileRouter = {
  imageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async ({ req }) => {
      // You can add authentication check here if needed
      return { uploadedBy: "user" };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Upload complete for", metadata.uploadedBy);
      console.log("File URL", file.url);

      return { url: file.url };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;