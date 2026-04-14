import Groq from "groq-sdk";

// Initialize Groq client
// It will automatically look for GROQ_API_KEY in process.env
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "dummy_key_to_prevent_init_error",
});

interface GenerateOptions {
  topic: string;
  imageContext?: string; // Base64 image
  language?: string;
}

export async function generatePostContent({
  topic,
  imageContext,
  language = "english",
}: GenerateOptions): Promise<string> {
  console.log(`[AI] Generating post for topic: "${topic}" in ${language}`);

  // CHECK FOR API KEY
  if (!process.env.GROQ_API_KEY) {
    console.warn("[AI] No GROQ_API_KEY found. Using Mock response.");
    return generateMockResponse(topic, imageContext, language);
  }

  try {
    const messages: any[] = [
      {
        role: "system",
        content: `You are a personal social media user sharing your own thoughts.
        - Perspective: ALWAYS use "I" ("Ich" in German), never "We". This is a personal account.
        - Length: Keep it SHORT and concise (tweet style, max 50 words). No long paragraphs.
        - Tone: Casual, authentic, personal.
        - Language: Output STRICTLY in ${language}.
        - Format: Use emojis sparingly but effectively. Add 2-3 specific hashtags.
        - Do not output anything else (like "Here is your post:"), just the post content.`,
      },
    ];

    const model = "llama-3.3-70b-versatile";

    if (imageContext) {
      console.log("[AI] Image provided, but Vision model unavailable. Generating based on topic.");
      // We can't send the image to a text model, so we just mention it in the system prompt or user prompt
      messages.push({
        role: "user",
        content: `Create a post about: ${topic}. The user has also uploaded an image (content unknown to you, but assume it's relevant).`,
      });
    } else {
      messages.push({
        role: "user",
        content: `Create a post about: ${topic}.`,
      });
    }

    const completion = await groq.chat.completions.create({
      messages: messages,
      model: model,
      temperature: 0.7,
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content || "Failed to generate content.";
  } catch (error) {
    console.error("[AI] Groq API Error:", error);
    console.log("[AI] Falling back to Mock response.");
    return generateMockResponse(topic, imageContext, language);
  }
}

// Fallback Mock Function
async function generateMockResponse(
  topic: string,
  imageContext: string | undefined,
  language: string,
): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const isGerman = language.toLowerCase() === "german" || language.toLowerCase() === "de";

  const templates = isGerman
    ? [
        `Hier ist ein Gedanke zu ${topic}! 🌟\n\nEs ist faszinierend, wie ${topic} unseren Alltag beeinflusst. ${imageContext ? "Das Bild fängt die Stimmung perfekt ein." : ""} \n\nWas denkst du darüber? #OpenVerse #${topic.replaceAll(/\s+/g, "")}`,

        `Habe gerade ${topic} entdeckt und bin begeistert! 🤯\n\n${imageContext ? "Die visuellen Eindrücke sprechen für sich." : "Ein tiefgründiges Thema mit so vielen Facetten."}\n\nBleibt dran für mehr Updates! ✨ #${topic.replaceAll(/\s+/g, "")} #Inspiration`,

        `Warum spricht niemand über ${topic}? 🤔\n\nDas ist ein echter Gamechanger. ${imageContext ? "Dieses Foto bringt es auf den Punkt." : "Ich denke schon den ganzen Tag darüber nach."}\n\nDiskutiert mit in den Kommentaren! 👇 #${topic.replaceAll(/\s+/g, "")} #Community`,
      ]
    : [
        `Here's a thought about ${topic}! 🌟\n\nIt's fascinating how ${topic} impacts our daily lives. ${imageContext ? "Looking at this image, you can really see the essence of it." : ""} \n\nWhat are your thoughts? #OpenVerse #${topic.replaceAll(/\s+/g, "")}`,

        `Just explored ${topic} and I'm amazed! 🤯\n\n${imageContext ? "The visuals generally speak for themselves." : "It's a deep subject with so many layers."}\n\nCan't wait to share more soon. Stay tuned! ✨ #${topic.replaceAll(/\s+/g, "")} #Inspiration`,

        `Why is nobody talking about ${topic}? 🤔\n\nIt's such a game changer. ${imageContext ? "This picture perfectly captures the mood." : "I've been thinking about this all day."}\n\nLet's discuss in the comments! 👇 #${topic.replaceAll(/\s+/g, "")} #Community`,
      ];

  return (
    templates[Math.floor(Math.random() * templates.length)] +
    "\n\n(Mock Generated - Add GROQ_API_KEY to use real AI)"
  );
}
