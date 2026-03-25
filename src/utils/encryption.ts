const KEY = "star-speller-secret-key"; // Simple key for obfuscation

export const sanitizeJsonString = (str: string): string => {
    // Replace control characters
    let cleaned = str.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, ' ');
    
    // Fix invalid JSON escapes
    let res = '';
    for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === '\\') {
            if (i + 1 < cleaned.length) {
                const next = cleaned[i + 1];
                if (['"', '\\', '/', 'b', 'f', 'n', 'r', 't'].includes(next)) {
                    res += '\\' + next;
                    i++;
                } else if (next === 'u') {
                    if (i + 5 < cleaned.length && /^[0-9a-fA-F]{4}$/.test(cleaned.substring(i + 2, i + 6))) {
                        res += '\\u' + cleaned.substring(i + 2, i + 6);
                        i += 5;
                    } else {
                        res += '\\\\';
                    }
                } else {
                    res += '\\\\';
                }
            } else {
                res += '\\\\';
            }
        } else {
            res += cleaned[i];
        }
    }
    return res;
};

export const encrypt = (text: string): string => {
    // Encode text to UTF-8 bytes
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    
    // Encrypt bytes
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = bytes[i] ^ KEY.charCodeAt(i % KEY.length);
    }
    
    // Convert Uint8Array to binary string
    let binaryString = "";
    for (let i = 0; i < bytes.length; i++) {
        binaryString += String.fromCharCode(bytes[i]);
    }
    
    return btoa(binaryString);
};

export const decrypt = (base64Text: string): string => {
    try {
        const binaryString = atob(base64Text);
        const bytes = new Uint8Array(binaryString.length);
        
        // Decrypt bytes
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
        }
        
        // Decode UTF-8 bytes to text
        const decoder = new TextDecoder('utf-8', { fatal: true });
        return decoder.decode(bytes);
    } catch (e) {
        // If it fails to decrypt or decode as UTF-8, it might be the old buggy format
        // Let's try the old decryption method as a fallback
        try {
            const binaryString = atob(base64Text);
            let result = "";
            for (let i = 0; i < binaryString.length; i++) {
                result += String.fromCharCode(binaryString.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
            }
            return result;
        } catch (fallbackError) {
            return base64Text; // If it fails completely, assume it's unencrypted
        }
    }
};
