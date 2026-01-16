import { Navbar } from "@/components/layout/navbar";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Coffee, MessageSquare, Newspaper, SmilePlus } from "lucide-react";
import { Link } from "wouter";

export default function HomePage() {
  const { user } = useAuth();

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 pt-24">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">Welcome back, {user?.username}!</h1>
          
          <div className="grid gap-6">
            <Link href="/discussions">
              <Card className="hover:bg-primary/5 transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MessageSquare className="h-6 w-6" />
                    <span>Join the Discussion</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Engage in meaningful conversations about topics that matter.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/news">
              <Card className="hover:bg-primary/5 transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Newspaper className="h-6 w-6" />
                    <span>Latest News</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Stay informed with fact-checked news from reliable sources.
                  </p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/entertainment">
              <Card className="hover:bg-primary/5 transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <SmilePlus className="h-6 w-6" />
                    <span>Entertainment</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Take a break and enjoy some lighthearted content.
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
