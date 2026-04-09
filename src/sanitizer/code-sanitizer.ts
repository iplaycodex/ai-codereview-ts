import { config } from '../config';
import { GitLabChange } from '../types';

interface CustomPattern {
  pattern: RegExp;
  repl: string;
  name: string;
}

class CodeSanitizer {
  private customPatterns: CustomPattern[];

  constructor() {
    this.customPatterns = this._loadCustomPatterns();
  }

  private _loadCustomPatterns(): CustomPattern[] {
    const patterns: CustomPattern[] = [];
    const customKeywords = config.sanitizerKeywords || '';

    if (customKeywords) {
      for (const keyword of customKeywords.split(',')) {
        const trimmed = keyword.trim();
        if (trimmed) {
          patterns.push({
            pattern: new RegExp(`(${trimmed})\\s*=\\s*["']([^"']+)["']`, 'gi'),
            repl: '$1="***SANITIZED***"',
            name: `custom_${trimmed}`,
          });
        }
      }
    }

    return patterns;
  }

  sanitize(codeText: string): string {
    if (!codeText) {
      return codeText;
    }

    // 1. Sanitize passwords
    codeText = this._sanitizePasswords(codeText);

    // 2. Sanitize API keys
    codeText = this._sanitizeApiKeys(codeText);

    // 3. Sanitize database URLs
    codeText = this._sanitizeDatabaseUrls(codeText);

    // 4. Sanitize IP addresses
    codeText = this._sanitizeIpAddresses(codeText);

    // 5. Sanitize phone numbers
    codeText = this._sanitizePhoneNumbers(codeText);

    // 6. Sanitize ID cards
    codeText = this._sanitizeIdCards(codeText);

    // 7. Sanitize emails
    codeText = this._sanitizeEmails(codeText);

    // 8. Sanitize JWT tokens
    codeText = this._sanitizeJwtTokens(codeText);

    // 9. Sanitize AWS keys
    codeText = this._sanitizeAwsKeys(codeText);

    // 10. Apply custom patterns
    codeText = this._applyCustomPatterns(codeText);

    return codeText;
  }

  sanitizeChanges(changes: GitLabChange[]): GitLabChange[] {
    const sanitizedChanges: GitLabChange[] = [];

    for (const change of changes) {
      const sanitizedChange = { ...change };
      if (sanitizedChange.diff) {
        sanitizedChange.diff = this.sanitize(sanitizedChange.diff);
      }
      sanitizedChanges.push(sanitizedChange);
    }

    return sanitizedChanges;
  }

  private _sanitizePasswords(text: string): string {
    const patterns: [RegExp, string][] = [
      // password = "xxx"
      [/(password|passwd|pwd)\s*=\s*["']([^"']+)["']/gi, '$1="***SANITIZED***"'],
      // password: xxx
      [/(password|passwd|pwd)\s*:\s*["']?([^'<>\s,}]+)["']?/gi, '$1: ***SANITIZED***'],
      // setPassword("xxx")
      [/(setPassword|set_passwd)\s*\(\s*["']([^"']+)["']\s*\)/gi, '$1("***SANITIZED***")'],
    ];

    for (const [pattern, repl] of patterns) {
      text = text.replace(pattern, repl);
    }

    return text;
  }

  private _sanitizeApiKeys(text: string): string {
    const patterns: [RegExp, string][] = [
      // api_key = "xxx"
      [/(api_key|apikey|api-key)\s*=\s*["']([^"']+)["']/gi, '$1="***SANITIZED***"'],
      // apiKey: xxx
      [/(apiKey|api_key)\s*:\s*["']?([^'<>\s,}]+)["']?/gi, '$1: ***SANITIZED***'],
      // access_token = "xxx"
      [/(access_token|accesstoken|access-token)\s*=\s*["']([^"']+)["']/gi, '$1="***SANITIZED***"'],
      // secret_key = "xxx"
      [/(secret_key|secretkey|secret-key|secret)\s*=\s*["']([^"']+)["']/gi, '$1="***SANITIZED***"'],
      // token = "xxx" (but preserve commit_token etc.)
      [/(?<!commit_)(?<!last_commit_)(token)\s*=\s*["']([^"']{10,})["']/gi, '$1="***SANITIZED***"'],
    ];

    for (const [pattern, repl] of patterns) {
      text = text.replace(pattern, repl);
    }

    return text;
  }

  private _sanitizeDatabaseUrls(text: string): string {
    const patterns: [RegExp, string][] = [
      // MySQL: mysql://user:password@host:port/db
      [/mysql:\/\/([^:]+):([^@]+)@([^/\s]+)/gi, 'mysql://$1:***SANITIZED***@$3'],
      // PostgreSQL: postgresql://user:password@host:port/db
      [/postgresql:\/\/([^:]+):([^@]+)@([^/\s]+)/gi, 'postgresql://$1:***SANITIZED***@$3'],
      // MongoDB: mongodb://user:password@host:port/db
      [/mongodb(\+srv)?:\/\/([^:]+):([^@]+)@([^\s]+)/gi, 'mongodb$1://$2:***SANITIZED***@$4'],
      // Redis: redis://:password@host:port
      [/redis:\/\/:([^@]+)@([^\s]+)/gi, 'redis://:***SANITIZED***@$2'],
      // JDBC: jdbc:mysql://host:port/db?user=xxx&password=xxx
      [/(jdbc:[^\s]+\?.*?password=)([^&\s]+)/gi, '$1***SANITIZED***'],
    ];

    for (const [pattern, repl] of patterns) {
      text = text.replace(pattern, repl);
    }

    return text;
  }

  private _sanitizeIpAddresses(text: string): string {
    if (config.sanitizeIp) {
      text = text.replace(
        /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g,
        'XXX.XXX.XXX.XXX'
      );
    }

    return text;
  }

  private _sanitizePhoneNumbers(text: string): string {
    const patterns: [RegExp, string][] = [
      // 13812345678
      [/\b(1[3-9]\d{9})\b/g, '1XX****XXXX'],
      // phone = "13812345678"
      [/(phone|mobile|cellphone)\s*[=:]\s*["']?(1[3-9]\d{9})["']?/gi, '$1="1XX****XXXX"'],
    ];

    for (const [pattern, repl] of patterns) {
      text = text.replace(pattern, repl);
    }

    return text;
  }

  private _sanitizeIdCards(text: string): string {
    const patterns: [RegExp, string][] = [
      // id_card = "123456789012345678"
      [/(id_card|idcard|id-card|身份证)\s*[=:]\s*["']?(\d{17}[\dXx])["']?/gi, '$1="******************"'],
      // Pure ID card number
      [/\b(\d{6})(19|20)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(\d{3}[\dXx])\b/g, '******************'],
    ];

    for (const [pattern, repl] of patterns) {
      text = text.replace(pattern, repl);
    }

    return text;
  }

  private _sanitizeEmails(text: string): string {
    const exampleDomains = ['example.com', 'test.com', 'sample.org'];

    text = text.replace(
      /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
      (match: string, local: string, domain: string) => {
        if (exampleDomains.some((ex) => domain.includes(ex))) {
          return match;
        }
        return `${local[0]}***@${domain}`;
      }
    );

    return text;
  }

  private _sanitizeJwtTokens(text: string): string {
    const jwtPattern = /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g;
    text = text.replace(jwtPattern, '***JWT_TOKEN***');
    return text;
  }

  private _sanitizeAwsKeys(text: string): string {
    const patterns: [RegExp, string][] = [
      // AWS Access Key ID
      [/(aws_access_key_id|aws_access_key)\s*=\s*["']?([A-Z0-9]{20})["']?/gi, '$1=***AWS_ACCESS_KEY***'],
      // AWS Secret Access Key
      [/(aws_secret_access_key|aws_secret_key)\s*=\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, '$1=***AWS_SECRET_KEY***'],
    ];

    for (const [pattern, repl] of patterns) {
      text = text.replace(pattern, repl);
    }

    return text;
  }

  private _applyCustomPatterns(text: string): string {
    for (const rule of this.customPatterns) {
      text = text.replace(rule.pattern, rule.repl);
    }

    return text;
  }
}

// Singleton
let _sanitizerInstance: CodeSanitizer | null = null;

export function getCodeSanitizer(): CodeSanitizer {
  if (_sanitizerInstance === null) {
    _sanitizerInstance = new CodeSanitizer();
  }
  return _sanitizerInstance;
}
