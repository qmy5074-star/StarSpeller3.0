const KEY = "star-speller-secret-key"; // Simple key for obfuscation

export const encrypt = (text: string): string => {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
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
        let result = "";
        for (let i = 0; i < binaryString.length; i++) {
            result += String.fromCharCode(binaryString.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length));
        }
        return result;
    } catch (e) {
        return base64Text; // If it fails to decrypt, assume it's unencrypted
    }
};
