/**
 * tests/pii-engine.test.js
 * Unit & regression tests for src/core/pii-engine.js
 *
 * Covers: redactString() — all 9 pattern categories + name detection
 *         deepRedactObj() — recursive JSON redaction
 */
const { loadPiiEngine, resetCloaker } = require('./helpers/setup');

let C;

beforeAll(() => {
  C = loadPiiEngine();
});

beforeEach(() => {
  resetCloaker();
});

// ─── Email Detection ─────────────────────────────────────────────────────────

describe('redactString — Emails', () => {
  test('detects standard email', () => {
    const { result, items } = C.redactString('Contact me at john@example.com please');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Email');
    expect(result).not.toContain('john@example.com');
    expect(result).toMatch(/\[EMAIL_\d+\]/);
  });

  test('detects email with plus addressing', () => {
    const { result, items } = C.redactString('user+tag@domain.co.uk');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Email');
    expect(result).not.toContain('user+tag@domain.co.uk');
  });

  test('detects multiple emails in one string', () => {
    const { items } = C.redactString('a@b.com and c@d.org');
    expect(items).toHaveLength(2);
  });

  test('does not redact when emails category is disabled', () => {
    C.categories.emails = false;
    const { result, items } = C.redactString('john@example.com');
    expect(items).toHaveLength(0);
    expect(result).toBe('john@example.com');
  });
});

// ─── Phone Number Detection ─────────────────────────────────────────────────

describe('redactString — Phone Numbers', () => {
  test('detects US phone with dashes', () => {
    const { items } = C.redactString('Call 555-123-4567');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Phone Number');
  });

  test('detects phone with parentheses', () => {
    const { items } = C.redactString('(555) 123-4567');
    expect(items).toHaveLength(1);
  });

  test('detects phone with +1 prefix', () => {
    const { items } = C.redactString('+1-555-123-4567');
    expect(items).toHaveLength(1);
  });

  test('detects phone with dots', () => {
    const { items } = C.redactString('555.123.4567');
    expect(items).toHaveLength(1);
  });

  test('does not redact when phones category is disabled', () => {
    C.categories.phones = false;
    const { result } = C.redactString('555-123-4567');
    expect(result).toBe('555-123-4567');
  });
});

// ─── SSN Detection ──────────────────────────────────────────────────────────

describe('redactString — SSN', () => {
  test('detects SSN with dashes', () => {
    const { items } = C.redactString('SSN: 123-45-6789');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('SSN');
  });

  test('detects SSN with spaces', () => {
    const { items } = C.redactString('123 45 6789');
    expect(items).toHaveLength(1);
  });

  test('detects SSN without separators', () => {
    const { items } = C.redactString('SSN is 123456789');
    expect(items).toHaveLength(1);
  });
});

// ─── Credit Card Detection ──────────────────────────────────────────────────

describe('redactString — Credit Cards', () => {
  test('detects credit card with spaces', () => {
    const { items } = C.redactString('Card: 4111 1111 1111 1111');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Credit Card');
  });

  test('detects credit card with dashes', () => {
    const { items } = C.redactString('4111-1111-1111-1111');
    expect(items).toHaveLength(1);
  });

  test('detects credit card without separators', () => {
    const { items } = C.redactString('4111111111111111');
    expect(items).toHaveLength(1);
  });
});

// ─── Address Detection ──────────────────────────────────────────────────────

describe('redactString — Addresses', () => {
  test('detects street address with St', () => {
    const { items } = C.redactString('I live at 123 Main St');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Street Address');
  });

  test('detects street address with Avenue', () => {
    const { items } = C.redactString('Office at 456 Park Avenue');
    expect(items).toHaveLength(1);
  });

  test('detects street address with Blvd', () => {
    const { items } = C.redactString('789 Sunset Blvd');
    expect(items).toHaveLength(1);
  });

  test('detects street address with Drive', () => {
    const { items } = C.redactString('10 Elm Drive');
    expect(items).toHaveLength(1);
  });

  test('detects street address with Lane', () => {
    const { items } = C.redactString('55 Birch Lane');
    expect(items).toHaveLength(1);
  });

  test('detects full address with city, state, and zip', () => {
    const { result, items } = C.redactString('I live at 123 Main St, Springfield, IL 62704');
    const addrItems = items.filter(i => i.type === 'Street Address');
    expect(addrItems).toHaveLength(1);
    expect(result).not.toContain('Springfield');
    expect(result).not.toContain('IL');
    expect(result).not.toContain('62704');
  });

  test('detects address with city and state but no zip', () => {
    const { result, items } = C.redactString('Office at 456 Park Avenue, New York, NY');
    const addrItems = items.filter(i => i.type === 'Street Address');
    expect(addrItems).toHaveLength(1);
    expect(result).not.toContain('New York');
    expect(result).not.toContain('NY');
  });

  test('detects address with apartment, city, state, zip', () => {
    const { result, items } = C.redactString('10 Elm Drive, Suite 200, Denver, CO 80202');
    const addrItems = items.filter(i => i.type === 'Street Address');
    expect(addrItems).toHaveLength(1);
    expect(result).not.toContain('Suite 200');
    expect(result).not.toContain('Denver');
    expect(result).not.toContain('80202');
  });

  test('detects address with zip+4 format', () => {
    const { result, items } = C.redactString('789 Oak Road, Austin, TX 73301-1234');
    const addrItems = items.filter(i => i.type === 'Street Address');
    expect(addrItems).toHaveLength(1);
    expect(result).not.toContain('73301-1234');
  });

  test('detects address with city only (no state/zip)', () => {
    const { result, items } = C.redactString('100 Pine Court, Portland');
    const addrItems = items.filter(i => i.type === 'Street Address');
    expect(addrItems).toHaveLength(1);
    expect(result).not.toContain('Portland');
  });
});

// ─── Date Detection ─────────────────────────────────────────────────────────

describe('redactString — Dates', () => {
  test('detects MM/DD/YYYY format', () => {
    const { items } = C.redactString('Born on 01/15/1990');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Date');
  });

  test('detects MM-DD-YYYY format', () => {
    const { items } = C.redactString('DOB: 12-25-2000');
    expect(items).toHaveLength(1);
  });

  test('detects single-digit month/day', () => {
    const { items } = C.redactString('Date: 1/5/1985');
    expect(items).toHaveLength(1);
  });

  test('does not detect invalid dates like 13/01/2000', () => {
    const { items } = C.redactString('13/01/2000');
    expect(items).toHaveLength(0);
  });
});

// ─── Medical Record Number Detection ────────────────────────────────────────

describe('redactString — Medical', () => {
  test('detects MRN: format', () => {
    const { items } = C.redactString('Patient MRN: 12345678');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Medical Record Number');
  });

  test('detects MR# format', () => {
    const { items } = C.redactString('MR#56789');
    expect(items).toHaveLength(1);
  });

  test('detects Medical Record format', () => {
    const { items } = C.redactString('Medical Record 9876543');
    expect(items).toHaveLength(1);
  });
});

// ─── IP Address Detection ───────────────────────────────────────────────────

describe('redactString — IP Addresses', () => {
  test('detects standard IPv4', () => {
    const { items } = C.redactString('Server at 192.168.1.1');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('IP Address');
  });

  test('detects boundary values (255.255.255.255)', () => {
    const { items } = C.redactString('Broadcast 255.255.255.255');
    expect(items).toHaveLength(1);
  });

  test('does not detect invalid IP (999.999.999.999)', () => {
    const { items } = C.redactString('Invalid 999.999.999.999');
    expect(items).toHaveLength(0);
  });

  test('detects loopback address', () => {
    const { items } = C.redactString('localhost 127.0.0.1');
    expect(items).toHaveLength(1);
  });
});

// ─── Name Detection ─────────────────────────────────────────────────────────

describe('redactString — Names', () => {
  test('detects two consecutive title-case words as a name', () => {
    const { items } = C.redactString('Patient is John Smith');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Person Name');
  });

  test('detects three-word name (with middle name)', () => {
    const { result, items } = C.redactString('Patient is John Michael Smith');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(1);
    const original = C.redactionMap[nameItems[0].placeholder].original;
    expect(original).toBe('John Michael Smith');
  });

  test('detects four-word name', () => {
    const { items } = C.redactString('Patient is Mary Jane Watson Parker');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(1);
    const original = C.redactionMap[nameItems[0].placeholder].original;
    expect(original).toBe('Mary Jane Watson Parker');
  });

  test('detects standalone common first name (James)', () => {
    const { result, items } = C.redactString('my friend James called today');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(1);
    const original = C.redactionMap[nameItems[0].placeholder].original;
    expect(original).toBe('James');
  });

  test('detects standalone common first name (Elizabeth)', () => {
    const { result, items } = C.redactString('Talk to Elizabeth tomorrow');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(1);
  });

  test('detects all top-20 common names standalone', () => {
    const commonNames = [
      'James', 'Robert', 'John', 'Michael', 'David',
      'William', 'Richard', 'Joseph', 'Thomas', 'Charles',
      'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara',
      'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen'
    ];
    for (const name of commonNames) {
      resetCloaker();
      const { items } = C.redactString('Talk to ' + name + ' please');
      const nameItems = items.filter(i => i.type === 'Person Name');
      expect(nameItems.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('does not detect non-common standalone word as a name', () => {
    const { items } = C.redactString('The report is ready');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('detects ALL CAPS two-word name', () => {
    const { items } = C.redactString('This is JOHN SMITH');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
  });

  test('does not detect common words as names', () => {
    const { result, items } = C.redactString('The Quick Brown Fox');
    const nameItems = items.filter(i => i.type === 'Person Name');
    for (const item of nameItems) {
      const original = C.redactionMap[item.placeholder]?.original || '';
      expect(original).not.toMatch(/^The /);
    }
  });

  test('does not detect day names as person names', () => {
    const { items } = C.redactString('Monday Tuesday schedule');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not detect month names as person names', () => {
    const { items } = C.redactString('January February report');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not redact names when names category is disabled', () => {
    C.categories.names = false;
    const { items } = C.redactString('John Smith');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not redact standalone common name when names disabled', () => {
    C.categories.names = false;
    const { items } = C.redactString('Ask James about it');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('detects name after capitalized common word at sentence start', () => {
    const { result, items } = C.redactString('Tell Johanna about the meeting');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(1);
    const original = C.redactionMap[nameItems[0].placeholder].original;
    expect(original).toBe('Johanna');
  });

  test('detects full name after capitalized common word', () => {
    const { result, items } = C.redactString('Ask Johanna Smith about it');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(1);
    const original = C.redactionMap[nameItems[0].placeholder].original;
    expect(original).toBe('Johanna Smith');
  });

  test('detects name between capitalized common words', () => {
    const { result, items } = C.redactString('Tell Johanna About the plan');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(1);
    const original = C.redactionMap[nameItems[0].placeholder].original;
    expect(original).toBe('Johanna');
  });

  test('detects common name after sentence-start word', () => {
    const { result, items } = C.redactString('Tell Michael about the meeting');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(1);
    expect(result).not.toContain('Michael');
  });

  // ── Full names & multi-word ───────────────────────────────────────────

  test('detects first + last name in natural sentence', () => {
    const { result, items } = C.redactString('Please contact Angela Merkel immediately');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Angela');
    expect(result).not.toContain('Merkel');
  });

  test('detects three-part Hispanic name', () => {
    const { result, items } = C.redactString('Her name is Maria Garcia Lopez');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Maria');
    expect(result).not.toContain('Garcia');
    expect(result).not.toContain('Lopez');
  });

  test('detects hyphenated name', () => {
    const { result, items } = C.redactString('Anna-Maria Gonzalez called this morning');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Gonzalez');
  });

  test('detects hyphenated first name (Jean-Pierre)', () => {
    const { result, items } = C.redactString('Send it to Jean-Pierre Dupont');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Jean-Pierre');
    expect(result).not.toContain('Dupont');
  });

  test('detects name with suffix (III)', () => {
    const { result, items } = C.redactString('His full name is William Henry Harrison III');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('William');
    expect(result).not.toContain('Harrison');
  });

  // ── Honorifics & titles ───────────────────────────────────────────────

  test('detects name with Dr. prefix', () => {
    const { result, items } = C.redactString('My doctor is Dr. Patel and she is great');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Patel');
  });

  test('detects name with Dr. prefix and full name', () => {
    const { result, items } = C.redactString('Dr. Sanjay Gupta diagnosed the patient');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Sanjay');
    expect(result).not.toContain('Gupta');
  });

  test('detects name with Mrs. prefix', () => {
    const { result, items } = C.redactString('My neighbor Mrs. Rodriguez called');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Rodriguez');
  });

  test('detects name with Prof. prefix', () => {
    const { result, items } = C.redactString('We spoke with Prof. Chen about the results');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Chen');
  });

  // ── Contextual name detection ─────────────────────────────────────────

  test('detects name preceded by title/role (Attorney)', () => {
    const { result, items } = C.redactString('Attorney Jennifer Lopez filed the case');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Jennifer');
    expect(result).not.toContain('Lopez');
  });

  test('detects name preceded by title/role (CEO)', () => {
    const { result, items } = C.redactString('CEO Tim Cook announced the product');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Tim');
    expect(result).not.toContain('Cook');
  });

  test('detects name after "Patient"', () => {
    const { result, items } = C.redactString('Patient Jane Doe has MRN: 123456');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Jane');
    expect(result).not.toContain('Doe');
  });

  test('detects name after "my name is"', () => {
    const { result, items } = C.redactString('My SSN is 123-45-6789 and my name is Robert Williams');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Robert');
    expect(result).not.toContain('Williams');
  });

  // ── Indian names ──────────────────────────────────────────────────────

  test('detects all top-20 Indian names standalone', () => {
    const indianNames = [
      'Aarav', 'Vivaan', 'Aditya', 'Virat', 'Arjun',
      'Sai', 'Reyansh', 'Rahul', 'Krishna', 'Ishaan',
      'Ananya', 'Diya', 'Priya', 'Raj', 'Isha',
      'Saanvi', 'Anika', 'Kavya', 'Riya', 'Pooja'
    ];
    for (const name of indianNames) {
      resetCloaker();
      const { items } = C.redactString('Talk to ' + name + ' please');
      const nameItems = items.filter(i => i.type === 'Person Name');
      expect(nameItems.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('detects Indian full name (first + last)', () => {
    const { result, items } = C.redactString('Please forward this to Amit Shah immediately');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Amit');
    expect(result).not.toContain('Shah');
  });

  test('detects Indian name with context', () => {
    const { result, items } = C.redactString('My name is Priya Sharma');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Priya');
    expect(result).not.toContain('Sharma');
  });

  // ── East Asian names ──────────────────────────────────────────────────

  test('detects East Asian name (family-first)', () => {
    const { result, items } = C.redactString('Professor Zhang Wei teaches math');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Zhang');
    expect(result).not.toContain('Wei');
  });

  test('detects short Asian name', () => {
    const { result, items } = C.redactString('Please ask Li Wei about the budget');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Li Wei');
  });

  // ── ALL CAPS and unusual casing ───────────────────────────────────────

  test('detects ALL CAPS full name', () => {
    const { result, items } = C.redactString('MICHAEL JORDAN played basketball');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('MICHAEL');
    expect(result).not.toContain('JORDAN');
  });

  // ── Multiple names in one string ──────────────────────────────────────

  test('detects two names joined by "and"', () => {
    const { result, items } = C.redactString('Elon Musk and Jeff Bezos attended the conference');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    // At least one of them should be caught
    const hasEither = !result.includes('Jeff Bezos') || !result.includes('Elon Musk');
    expect(hasEither).toBe(true);
  });

  test('detects name alongside email in same string', () => {
    const { result, items } = C.redactString('I emailed john.smith@company.com to reach Michael Johnson');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Michael Johnson');
  });

  test('detects name alongside SSN in same string', () => {
    const { result, items } = C.redactString('Name: Robert Williams, SSN: 123-45-6789');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Robert');
    expect(result).not.toContain('Williams');
  });

  // ── Negative cases — must NOT flag as names ───────────────────────────

  test('does not detect product/company names as person names', () => {
    const { items } = C.redactString('The product launch is scheduled for next week');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not detect generic business text as names', () => {
    const { items } = C.redactString('We discussed the marketing strategy today');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not detect generic request text as names', () => {
    const { items } = C.redactString('Can you review the quarterly budget report');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not detect programming terms as names', () => {
    const { items } = C.redactString('I need help with the JavaScript program');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not detect acronyms as names', () => {
    const { items } = C.redactString('The CEO and CFO approved the deal');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not detect "customer support" as a name', () => {
    const { items } = C.redactString('Reach out to customer support for help');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });

  test('does not detect weekday in sentence as name', () => {
    const { items } = C.redactString('The file was updated on Monday by the team');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });
});

// ─── Passport Number Detection ──────────────────────────────────────────────

describe('redactString — Passport Numbers', () => {
  test('detects US passport format (C + 8 digits)', () => {
    const { items } = C.redactString('Passport: C12345678');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Passport Number');
  });

  test('detects passport with "passport no" prefix', () => {
    const { result, items } = C.redactString('passport no: AB1234567');
    expect(items).toHaveLength(1);
    expect(result).toMatch(/\[PASSPORT_\d+\]/);
  });

  test('detects passport number with # prefix', () => {
    const { items } = C.redactString('Passport# E98765432');
    expect(items).toHaveLength(1);
  });

  test('does not redact when passport category is disabled', () => {
    C.categories.passport = false;
    const { items } = C.redactString('Passport: C12345678');
    const passportItems = items.filter(i => i.type === 'Passport Number');
    expect(passportItems).toHaveLength(0);
  });
});

// ─── Driver's License Detection ─────────────────────────────────────────────

describe("redactString — Driver's License", () => {
  test('detects DL number with DL prefix', () => {
    const { items } = C.redactString('DL: D12345678');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Drivers License');
  });

  test("detects driver's license with full prefix", () => {
    const { result, items } = C.redactString("Driver's License: S1234567890");
    expect(items).toHaveLength(1);
    expect(result).toMatch(/\[DL_\d+\]/);
  });

  test('detects drivers license with "drivers lic" prefix', () => {
    const { items } = C.redactString('drivers lic# ABC123456');
    expect(items).toHaveLength(1);
  });

  test('does not redact when driversLicense category is disabled', () => {
    C.categories.driversLicense = false;
    const { items } = C.redactString('DL: D12345678');
    const dlItems = items.filter(i => i.type === 'Drivers License');
    expect(dlItems).toHaveLength(0);
  });
});

// ─── Tax ID Detection ───────────────────────────────────────────────────────

describe('redactString — Tax IDs (TIN/EIN)', () => {
  test('detects EIN with prefix', () => {
    const { items } = C.redactString('EIN: 12-3456789');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Tax ID');
  });

  test('detects TIN with prefix', () => {
    const { result, items } = C.redactString('TIN: 98-7654321');
    expect(items).toHaveLength(1);
    expect(result).toMatch(/\[TAXID_\d+\]/);
  });

  test('detects ITIN with prefix', () => {
    const { items } = C.redactString('ITIN# 90-1234567');
    expect(items).toHaveLength(1);
  });

  test('does not redact when taxId category is disabled', () => {
    C.categories.taxId = false;
    const { items } = C.redactString('EIN: 12-3456789');
    const taxItems = items.filter(i => i.type === 'Tax ID');
    expect(taxItems).toHaveLength(0);
  });
});

// ─── Bank Account / IBAN / SWIFT Detection ──────────────────────────────────

describe('redactString — Bank Accounts', () => {
  test('detects bank account number with prefix', () => {
    const { items } = C.redactString('Account: 12345678901234');
    expect(items.some(i => i.type === 'Bank Account')).toBe(true);
  });

  test('detects acct# format', () => {
    const { items } = C.redactString('acct# 9876543210');
    expect(items.some(i => i.type === 'Bank Account')).toBe(true);
  });

  test('detects IBAN', () => {
    const { result, items } = C.redactString('IBAN: GB29 NWBK 6016 1331 9268 19');
    expect(items.some(i => i.type === 'Bank Account')).toBe(true);
    expect(result).toMatch(/\[BANK_\d+\]/);
  });

  test('detects SWIFT/BIC code', () => {
    const { items } = C.redactString('SWIFT: NWBKGB2L');
    expect(items.some(i => i.type === 'Bank Account')).toBe(true);
  });

  test('detects SWIFT code with branch', () => {
    const { items } = C.redactString('BIC: DEUTDEFF500');
    expect(items.some(i => i.type === 'Bank Account')).toBe(true);
  });

  test('does not redact when bankAccount category is disabled', () => {
    C.categories.bankAccount = false;
    const { items } = C.redactString('IBAN: GB29 NWBK 6016 1331 9268 19');
    const bankItems = items.filter(i => i.type === 'Bank Account');
    expect(bankItems).toHaveLength(0);
  });
});

// ─── MAC Address Detection ──────────────────────────────────────────────────

describe('redactString — MAC Addresses', () => {
  test('detects MAC address with colons', () => {
    const { items } = C.redactString('MAC: 00:1A:2B:3C:4D:5E');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('MAC Address');
  });

  test('detects MAC address with dashes', () => {
    const { result, items } = C.redactString('Device MAC 00-1A-2B-3C-4D-5E');
    expect(items).toHaveLength(1);
    expect(result).toMatch(/\[MAC_\d+\]/);
  });

  test('detects lowercase MAC address', () => {
    const { items } = C.redactString('mac: aa:bb:cc:dd:ee:ff');
    expect(items).toHaveLength(1);
  });

  test('does not redact when macAddress category is disabled', () => {
    C.categories.macAddress = false;
    const { items } = C.redactString('MAC: 00:1A:2B:3C:4D:5E');
    const macItems = items.filter(i => i.type === 'MAC Address');
    expect(macItems).toHaveLength(0);
  });
});

// ─── UUID / GUID Detection ──────────────────────────────────────────────────

describe('redactString — UUIDs', () => {
  test('detects standard UUID v4', () => {
    const { items } = C.redactString('ID: 550e8400-e29b-41d4-a716-446655440000');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('UUID');
  });

  test('detects uppercase UUID', () => {
    const { result, items } = C.redactString('GUID: A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
    expect(items).toHaveLength(1);
    expect(result).toMatch(/\[UUID_\d+\]/);
  });

  test('does not flag short hex strings as UUID', () => {
    const { items } = C.redactString('hash: abcd1234');
    const uuidItems = items.filter(i => i.type === 'UUID');
    expect(uuidItems).toHaveLength(0);
  });

  test('does not redact when uuid category is disabled', () => {
    C.categories.uuid = false;
    const { items } = C.redactString('ID: 550e8400-e29b-41d4-a716-446655440000');
    const uuidItems = items.filter(i => i.type === 'UUID');
    expect(uuidItems).toHaveLength(0);
  });
});

// ─── URL Detection ──────────────────────────────────────────────────────────

describe('redactString — URLs', () => {
  test('detects https URL', () => {
    const { items } = C.redactString('Visit https://example.com/page');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('URL');
  });

  test('detects http URL', () => {
    const { result, items } = C.redactString('Link: http://internal.company.com/dashboard?user=123');
    expect(items).toHaveLength(1);
    expect(result).toMatch(/\[URL_\d+\]/);
  });

  test('detects URL with path and query', () => {
    const { items } = C.redactString('Go to https://app.example.com/api/v2/users?id=42&token=abc');
    expect(items).toHaveLength(1);
  });

  test('does not flag plain text with "http" mention', () => {
    const { items } = C.redactString('use the http protocol for communication');
    const urlItems = items.filter(i => i.type === 'URL');
    expect(urlItems).toHaveLength(0);
  });

  test('does not redact when urls category is disabled', () => {
    C.categories.urls = false;
    const { items } = C.redactString('Visit https://example.com');
    const urlItems = items.filter(i => i.type === 'URL');
    expect(urlItems).toHaveLength(0);
  });
});

// ─── Credentials Detection ──────────────────────────────────────────────────

describe('redactString — Credentials', () => {
  test('detects password field', () => {
    const { items } = C.redactString('password: SuperSecret123!');
    expect(items.some(i => i.type === 'Credential')).toBe(true);
  });

  test('detects pwd= format', () => {
    const { items } = C.redactString('pwd=MyP@ssw0rd');
    expect(items.some(i => i.type === 'Credential')).toBe(true);
  });

  test('detects API key', () => {
    const { result, items } = C.redactString('api_key: sk_live_abc123def456ghi789');
    expect(items.some(i => i.type === 'Credential')).toBe(true);
    expect(result).toMatch(/\[SECRET_\d+\]/);
  });

  test('detects api-secret format', () => {
    const { items } = C.redactString('api-secret="ABCDEF123456789"');
    expect(items.some(i => i.type === 'Credential')).toBe(true);
  });

  test('detects Bearer token', () => {
    const { items } = C.redactString('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
    expect(items.some(i => i.type === 'Credential')).toBe(true);
  });

  test('detects private key block', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn\n-----END RSA PRIVATE KEY-----';
    const { items } = C.redactString(key);
    expect(items.some(i => i.type === 'Credential')).toBe(true);
  });

  test('detects access_key format', () => {
    const { items } = C.redactString('access_key=AKIAIOSFODNN7EXAMPLE');
    expect(items.some(i => i.type === 'Credential')).toBe(true);
  });

  test('does not redact when credentials category is disabled', () => {
    C.categories.credentials = false;
    const { items } = C.redactString('password: SuperSecret123!');
    const credItems = items.filter(i => i.type === 'Credential');
    expect(credItems).toHaveLength(0);
  });
});

// ─── Expanded Date Formats ──────────────────────────────────────────────────

describe('redactString — Expanded Date Formats', () => {
  test('detects YYYY-MM-DD (ISO format)', () => {
    const { items } = C.redactString('Born: 1990-01-15');
    const dateItems = items.filter(i => i.type === 'Date');
    expect(dateItems.length).toBeGreaterThanOrEqual(1);
  });

  test('detects "January 15, 2000" format', () => {
    const { items } = C.redactString('Admitted on January 15, 2000');
    const dateItems = items.filter(i => i.type === 'Date');
    expect(dateItems).toHaveLength(1);
  });

  test('detects "15 March 1985" format', () => {
    const { items } = C.redactString('DOB: 15 March 1985');
    const dateItems = items.filter(i => i.type === 'Date');
    expect(dateItems).toHaveLength(1);
  });

  test('detects abbreviated month (Sep 3, 2021)', () => {
    const { items } = C.redactString('Discharge date: Sep 3, 2021');
    const dateItems = items.filter(i => i.type === 'Date');
    expect(dateItems).toHaveLength(1);
  });

  test('detects abbreviated month (3 Oct 2019)', () => {
    const { items } = C.redactString('Date of death: 3 Oct 2019');
    const dateItems = items.filter(i => i.type === 'Date');
    expect(dateItems).toHaveLength(1);
  });
});

// ─── Expanded Medical/Health Identifiers ────────────────────────────────────

describe('redactString — Expanded Medical Identifiers', () => {
  test('detects Health Plan number', () => {
    const { items } = C.redactString('Health Plan: HPB1234567');
    expect(items.some(i => i.type === 'Medical Record Number')).toBe(true);
  });

  test('detects Beneficiary number', () => {
    const { items } = C.redactString('Beneficiary# 1EG4TE5MK73');
    expect(items.some(i => i.type === 'Medical Record Number')).toBe(true);
  });

  test('detects Patient Account number', () => {
    const { items } = C.redactString('Patient Account: PA98765432');
    expect(items.some(i => i.type === 'Medical Record Number')).toBe(true);
  });

  test('detects Patient ID', () => {
    const { items } = C.redactString('Patient ID# 12345678');
    expect(items.some(i => i.type === 'Medical Record Number')).toBe(true);
  });

  test('detects Insurance Policy number', () => {
    const { items } = C.redactString('Insurance Policy: POL123456');
    expect(items.some(i => i.type === 'Medical Record Number')).toBe(true);
  });

  test('detects Insurance ID', () => {
    const { items } = C.redactString('Insurance ID: INS9876543');
    expect(items.some(i => i.type === 'Medical Record Number')).toBe(true);
  });
});

// ─── IPv6 Detection ─────────────────────────────────────────────────────────

describe('redactString — IPv6', () => {
  test('detects full IPv6 address', () => {
    const { items } = C.redactString('IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    const ipItems = items.filter(i => i.type === 'IP Address');
    expect(ipItems).toHaveLength(1);
  });

  test('detects IPv4-mapped IPv6 address', () => {
    const { items } = C.redactString('Mapped: ::ffff:192.168.1.1');
    const ipItems = items.filter(i => i.type === 'IP Address');
    expect(ipItems.length).toBeGreaterThanOrEqual(1);
  });

  test('still detects IPv4 address', () => {
    const { items } = C.redactString('Server: 192.168.1.1');
    const ipItems = items.filter(i => i.type === 'IP Address');
    expect(ipItems).toHaveLength(1);
  });
});

// ─── Cross-category: Multiple New Types in One String ───────────────────────

describe('redactString — Multiple New Categories', () => {
  test('redacts passport and bank account in same string', () => {
    const { items } = C.redactString('Passport: C12345678, IBAN: GB29 NWBK 6016 1331 9268 19');
    const types = items.map(i => i.type);
    expect(types).toContain('Passport Number');
    expect(types).toContain('Bank Account');
  });

  test('redacts credential and UUID in same string', () => {
    const { items } = C.redactString('api_key: sk_live_abc123def456 for device 550e8400-e29b-41d4-a716-446655440000');
    const types = items.map(i => i.type);
    expect(types).toContain('Credential');
    expect(types).toContain('UUID');
  });

  test('redacts MAC address and URL in same string', () => {
    const { items } = C.redactString('Device 00:1A:2B:3C:4D:5E at https://admin.example.com/devices');
    const types = items.map(i => i.type);
    expect(types).toContain('MAC Address');
    expect(types).toContain('URL');
  });

  test('all new categories can be disabled simultaneously', () => {
    C.categories.passport = false;
    C.categories.driversLicense = false;
    C.categories.taxId = false;
    C.categories.bankAccount = false;
    C.categories.macAddress = false;
    C.categories.urls = false;
    C.categories.credentials = false;
    C.categories.uuid = false;
    const text = 'Passport: C12345678 DL: D12345678 EIN: 12-3456789 IBAN: GB29NWBK60161331926819 MAC: 00:1A:2B:3C:4D:5E https://example.com password: test1234 550e8400-e29b-41d4-a716-446655440000';
    const { items } = C.redactString(text);
    const newTypes = ['Passport Number', 'Drivers License', 'Tax ID', 'Bank Account', 'MAC Address', 'URL', 'Credential', 'UUID'];
    const newItems = items.filter(i => newTypes.includes(i.type));
    expect(newItems).toHaveLength(0);
  });
});

// ─── Custom Word Redaction ───────────────────────────────────────────────────

describe('redactString — Custom Words', () => {
  const HASH_RE = /\[[0-9a-f]{6}\]/;
  const HASH_RE_G = /\[[0-9a-f]{6}\]/g;

  test('redacts a custom word with [hash] placeholder', () => {
    C.customWords = [{ word: 'acme' }];
    const { result, items } = C.redactString('I work at acme corporation');
    expect(result).toMatch(HASH_RE);
    expect(result).not.toContain('acme');
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Custom Word');
  });

  test('always generates [hash] format regardless of extra fields', () => {
    C.customWords = [{ word: 'acme', hash: 'f0a1b2' }];
    const { result, items } = C.redactString('I work at acme corporation');
    expect(result).toMatch(HASH_RE);
    expect(items).toHaveLength(1);
  });

  test('redacts multiple occurrences of the same word', () => {
    C.customWords = [{ word: 'secret' }];
    const { result, items } = C.redactString('The secret project uses secret methods');
    const matches = result.match(HASH_RE_G);
    expect(matches).toHaveLength(2);
    expect(items).toHaveLength(2);
  });

  test('each occurrence gets a different hash (non-deterministic)', () => {
    C.customWords = [{ word: 'secret' }];
    const { result } = C.redactString('The secret project uses secret methods');
    const matches = result.match(HASH_RE_G);
    expect(matches).toHaveLength(2);
    // Hashes are random so they should (almost certainly) differ
    expect(matches[0]).not.toBe(matches[1]);
  });

  test('redacts multiple different custom words', () => {
    C.customWords = [
      { word: 'acme' },
      { word: 'topsecret' }
    ];
    const { result } = C.redactString('acme runs topsecret projects');
    expect(result).not.toContain('acme');
    expect(result).not.toContain('topsecret');
    const matches = result.match(HASH_RE_G);
    expect(matches).toHaveLength(2);
  });

  test('does not redact partial word matches', () => {
    C.customWords = [{ word: 'cat' }];
    const { result } = C.redactString('The category is concatenated');
    expect(result).toBe('The category is concatenated');
  });

  test('skips entries with empty word field', () => {
    C.customWords = [{ word: '' }];
    const { result, items } = C.redactString('Hello world');
    expect(items).toHaveLength(0);
    expect(result).toBe('Hello world');
  });

  test('stores custom word in redaction map with [hash] key', () => {
    C.customWords = [{ word: 'acme' }];
    C.redactString('I work at acme');
    const entries = Object.entries(C.redactionMap).filter(([k]) => HASH_RE.test(k));
    expect(entries).toHaveLength(1);
    expect(entries[0][1].original).toBe('acme');
    expect(entries[0][1].type).toBe('Custom Word');
  });

  test('custom words are applied after built-in patterns', () => {
    C.customWords = [{ word: 'projectx' }];
    const { result, items } = C.redactString('Contact john@example.com about projectx');
    expect(result).toMatch(/\[EMAIL_\d+\]/);
    expect(result).toMatch(HASH_RE);
    const types = items.map(i => i.type);
    expect(types).toContain('Email');
    expect(types).toContain('Custom Word');
  });

  test('handles special regex characters in custom word', () => {
    C.customWords = [{ word: 'cost$100' }];
    const { result } = C.redactString('The item is cost$100 total');
    expect(result).toMatch(HASH_RE);
    expect(result).not.toContain('cost$100');
  });
});

// ─── Custom Words — Auto-detected Regex ─────────────────────────────────────

describe('redactString — Custom Words (Auto-detected Regex)', () => {
  const HASH_RE = /\[[0-9a-f]{6}\]/;
  const HASH_RE_G = /\[[0-9a-f]{6}\]/g;

  test('auto-detects [0-9]+ as regex and matches employee IDs', () => {
    C.customWords = [{ word: 'EMP-[0-9]+' }];
    const { result, items } = C.redactString('Assign EMP-293445 to the project');
    expect(result).not.toContain('EMP-293445');
    expect(result).toMatch(HASH_RE);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('Custom Word');
  });

  test('auto-detects \\d+ as regex and matches multiple occurrences', () => {
    C.customWords = [{ word: 'EMP-\\d+' }];
    const { result } = C.redactString('EMP-100 and EMP-200 are assigned');
    expect(result).not.toContain('EMP-100');
    expect(result).not.toContain('EMP-200');
    const matches = result.match(HASH_RE_G);
    expect(matches).toHaveLength(2);
  });

  test('auto-detects character classes and quantifiers', () => {
    C.customWords = [{ word: 'PROJ-[A-Z]{2}-\\d{4}' }];
    const { result } = C.redactString('Working on PROJ-AB-1234 and PROJ-XY-5678');
    expect(result).not.toContain('PROJ-AB-1234');
    expect(result).not.toContain('PROJ-XY-5678');
    const matches = result.match(HASH_RE_G);
    expect(matches).toHaveLength(2);
  });

  test('auto-detects alternation with parentheses and pipe', () => {
    C.customWords = [{ word: '(?:internal|confidential)\\s+ref\\s*#?\\d+' }];
    const { result } = C.redactString('See internal ref#42 and confidential ref 99');
    expect(result).not.toContain('internal ref#42');
    expect(result).not.toContain('confidential ref 99');
  });

  test('invalid regex with metacharacters is silently skipped', () => {
    C.customWords = [{ word: '[invalid(' }];
    const { result } = C.redactString('This has [invalid( text');
    expect(result).toBe('This has [invalid( text');
  });

  test('word without metacharacters uses plain text matching', () => {
    C.customWords = [{ word: 'acme' }];
    const { result } = C.redactString('The acme corporation');
    expect(result).toMatch(HASH_RE);
    expect(result).not.toContain('acme');
  });

  test('plain word with $ but no regex metacharacters is escaped properly', () => {
    C.customWords = [{ word: 'cost$100' }];
    const { result } = C.redactString('The item is cost$100 total');
    expect(result).toMatch(HASH_RE);
    expect(result).not.toContain('cost$100');
  });

  test('regex pattern does not re-redact existing placeholders', () => {
    C.customWords = [{ word: '\\d{3,}' }];
    const { result } = C.redactString('My SSN is 123-45-6789');
    // SSN should be caught by built-in pattern first
    expect(result).toMatch(/\[SSN_\d+\]/);
  });

  test('mixed plain and regex-detected custom words work together', () => {
    C.customWords = [
      { word: 'acme' },
      { word: 'TICKET-\\d+' }
    ];
    const { result } = C.redactString('acme filed TICKET-9876');
    expect(result).not.toContain('acme');
    expect(result).not.toContain('TICKET-9876');
    const matches = result.match(HASH_RE_G);
    expect(matches).toHaveLength(2);
  });

  test('word with only dot is treated as plain text', () => {
    C.customWords = [{ word: 'secret.project' }];
    const { result } = C.redactString('Working on secret.project now');
    expect(result).toMatch(HASH_RE);
    expect(result).not.toContain('secret.project');
  });
});

// ─── Placeholder Format & Redaction Map ─────────────────────────────────────

describe('redactString — Placeholders & Map', () => {
  test('placeholders follow [LABEL_N] format', () => {
    const { result } = C.redactString('john@example.com');
    expect(result).toMatch(/^\[EMAIL_\d+\]$/);
  });

  test('redaction map stores original value', () => {
    C.redactString('john@example.com');
    const entries = Object.entries(C.redactionMap);
    expect(entries.length).toBeGreaterThan(0);
    const [placeholder, data] = entries[entries.length - 1];
    expect(data.original).toBe('john@example.com');
    expect(data.type).toBe('Email');
  });

  test('counter increments across calls', () => {
    C.redactString('a@b.com');
    const first = C.redactionCounter;
    C.redactString('c@d.com');
    expect(C.redactionCounter).toBe(first + 1);
  });

  test('does not double-redact existing placeholders', () => {
    const { result } = C.redactString('john@example.com');
    // result is now "[EMAIL_N]" — redacting it again should leave it unchanged
    const { result: result2, items } = C.redactString(result);
    expect(result2).toBe(result);
    expect(items).toHaveLength(0);
  });
});

// ─── Short/Empty Input ──────────────────────────────────────────────────────

describe('redactString — Edge Cases', () => {
  test('returns empty string unchanged', () => {
    const { result, items } = C.redactString('');
    expect(result).toBe('');
    expect(items).toHaveLength(0);
  });

  test('returns null/undefined gracefully', () => {
    const { result, items } = C.redactString(null);
    expect(result).toBeNull();
    expect(items).toHaveLength(0);
  });

  test('returns very short string unchanged', () => {
    const { result, items } = C.redactString('ab');
    expect(result).toBe('ab');
    expect(items).toHaveLength(0);
  });

  test('text with no PII returns unchanged', () => {
    const input = 'The weather is nice today, no personal info here.';
    const { result, items } = C.redactString(input);
    expect(result).toBe(input);
    expect(items).toHaveLength(0);
  });
});

// ─── Multiple PII Types in One String ───────────────────────────────────────

describe('redactString — Combined PII', () => {
  test('redacts email and phone in the same string', () => {
    const { items } = C.redactString('Email: john@example.com, Phone: 555-123-4567');
    const types = items.map(i => i.type);
    expect(types).toContain('Email');
    expect(types).toContain('Phone Number');
  });

  test('redacts address and SSN in the same string', () => {
    const { items } = C.redactString('Lives at 123 Main St, SSN 123-45-6789');
    const types = items.map(i => i.type);
    expect(types).toContain('Street Address');
    expect(types).toContain('SSN');
  });
});

// ─── deepRedactObj ──────────────────────────────────────────────────────────

describe('deepRedactObj', () => {
  test('redacts string values in a flat object', () => {
    const { result, items } = C.deepRedactObj({ email: 'john@example.com' });
    expect(items).toHaveLength(1);
    expect(result.email).toMatch(/\[EMAIL_\d+\]/);
  });

  test('redacts nested object values', () => {
    const obj = {
      user: {
        contact: {
          email: 'test@example.com',
          phone: '555-123-4567'
        }
      }
    };
    const { result, items } = C.deepRedactObj(obj);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(result.user.contact.email).toMatch(/\[EMAIL_\d+\]/);
    expect(result.user.contact.phone).toMatch(/\[PHONE_\d+\]/);
  });

  test('redacts strings inside arrays', () => {
    const { result, items } = C.deepRedactObj(['john@example.com', 'clean text']);
    expect(items).toHaveLength(1);
    expect(result[0]).toMatch(/\[EMAIL_\d+\]/);
    expect(result[1]).toBe('clean text');
  });

  test('skips short strings (< 5 chars)', () => {
    const { result, items } = C.deepRedactObj({ val: 'abc' });
    expect(items).toHaveLength(0);
    expect(result.val).toBe('abc');
  });

  test('passes through numbers, booleans, null', () => {
    const obj = { a: 42, b: true, c: null };
    const { result } = C.deepRedactObj(obj);
    expect(result).toEqual({ a: 42, b: true, c: null });
  });

  test('does not mutate the original object', () => {
    const original = { email: 'john@example.com' };
    C.deepRedactObj(original);
    expect(original.email).toBe('john@example.com');
  });
});

// ─── Regression: Patterns with global flag reset ─────────────────────────────

describe('Regression — Regex Global Flag', () => {
  test('repeated calls on same pattern type work correctly', () => {
    // Global regex lastIndex bug — if not reset, second call may miss matches
    const r1 = C.redactString('john@example.com');
    expect(r1.items).toHaveLength(1);

    const r2 = C.redactString('jane@example.com');
    expect(r2.items).toHaveLength(1);

    const r3 = C.redactString('test@domain.org');
    expect(r3.items).toHaveLength(1);
  });
});

// ─── Regression: Category toggle isolation ───────────────────────────────────

describe('Regression — Category Isolation', () => {
  test('disabling one category does not affect others', () => {
    C.categories.emails = false;
    const { items } = C.redactString('john@example.com and 555-123-4567');
    const types = items.map(i => i.type);
    expect(types).not.toContain('Email');
    expect(types).toContain('Phone Number');
  });

  test('all categories can be disabled', () => {
    Object.keys(C.categories).forEach(k => { C.categories[k] = false; });
    const text = 'john@example.com 555-123-4567 123-45-6789 4111 1111 1111 1111 123 Main St 01/15/1990 MRN: 12345 192.168.1.1 John Smith';
    const { items } = C.redactString(text);
    expect(items).toHaveLength(0);
  });
});

// ─── NLP Name Detection (compromise.js) ─────────────────────────────────────

describe('NLP Name Detection', () => {
  test('compromise.js nlp global is available', () => {
    expect(typeof window.nlp).toBe('function');
  });

  test('nlp detects person name with context', () => {
    const { items } = C.redactString('I spoke with Dr. Martin Luther King about the plan');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
  });

  test('nlp detects name in natural sentence', () => {
    const { result, items } = C.redactString('Please contact Sarah Connor regarding the file');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
    expect(result).not.toContain('Sarah');
    expect(result).not.toContain('Connor');
  });

  test('nlp does not flag common nouns as names', () => {
    const { items } = C.redactString('The report is on the table and the data looks correct');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });
});

// ─── Regex Fallback ─────────────────────────────────────────────────────────

describe('Regex Fallback (NLP unavailable)', () => {
  let savedNlp;

  beforeEach(() => {
    savedNlp = window.nlp;
    // Simulate NLP failure by making nlp throw
    window.nlp = function () { throw new Error('simulated NLP failure'); };
    // Reload pii-engine to pick up the broken nlp
    const { loadSource } = require('./helpers/setup');
    loadSource('src/core/pii-engine.js');
    C = window.__cloaker;
    resetCloaker();
  });

  afterEach(() => {
    // Restore real nlp and reload pii-engine
    window.nlp = savedNlp;
    const { loadSource } = require('./helpers/setup');
    loadSource('src/core/pii-engine.js');
    C = window.__cloaker;
    resetCloaker();
  });

  test('falls back to regex when nlp throws', () => {
    const { items } = C.redactString('Patient is John Smith');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
  });

  test('regex fallback detects standalone common name', () => {
    const { items } = C.redactString('Ask James about the meeting');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems.length).toBeGreaterThanOrEqual(1);
  });

  test('regex fallback does not flag common words', () => {
    const { items } = C.redactString('Monday Tuesday schedule update');
    const nameItems = items.filter(i => i.type === 'Person Name');
    expect(nameItems).toHaveLength(0);
  });
});

// ─── Scrub Cache ────────────────────────────────────────────────────────────

describe('Scrub Cache', () => {
  test('second call with identical text returns cached result', () => {
    const first = C.redactString('Contact john@example.com today');
    C.redactionMap = {};
    C.redactionCounter = 0;
    const second = C.redactString('Contact john@example.com today');
    // Result should be identical
    expect(second.result).toBe(first.result);
    expect(second.items).toEqual(first.items);
    // Map should be re-populated from cache
    expect(Object.keys(C.redactionMap).length).toBeGreaterThan(0);
  });

  test('cache does not return stale result after clearScrubCache', () => {
    const first = C.redactString('Contact john@example.com today');
    C.clearScrubCache();
    C.redactionMap = {};
    C.redactionCounter = 0;
    const second = C.redactString('Contact john@example.com today');
    // New placeholders should have different counter numbers
    expect(second.result).toMatch(/\[EMAIL_\d+\]/);
  });

  test('different texts get different cache entries', () => {
    const a = C.redactString('john@example.com');
    const b = C.redactString('jane@other.org');
    expect(a.result).not.toBe(b.result);
  });

  test('clearScrubCache is exposed on __cloaker', () => {
    expect(typeof C.clearScrubCache).toBe('function');
  });
});

// ─── Cross-Prompt Placeholder Consistency ───────────────────────────────────

describe('Cross-prompt placeholder consistency', () => {
  beforeEach(() => {
    resetCloaker();
  });

  test('same name reuses placeholder across different texts', () => {
    const r1 = C.redactString('My name is John Smith and I need help.');
    expect(r1.result).toContain('[NAME_1]');
    // Second prompt — different text, same name
    const r2 = C.redactString('Please update the file for John Smith.');
    expect(r2.result).toContain('[NAME_1]');
    expect(r2.result).not.toMatch(/\[NAME_[2-9]\d*\]/);
  });

  test('same email reuses placeholder across different texts', () => {
    const r1 = C.redactString('Contact me at john@example.com please.');
    const emailPh = r1.result.match(/\[EMAIL_\d+\]/)[0];
    const r2 = C.redactString('I already sent it to john@example.com yesterday.');
    expect(r2.result).toContain(emailPh);
  });

  test('same SSN reuses placeholder across different texts', () => {
    const r1 = C.redactString('SSN: 123-45-6789');
    const ssnPh = r1.result.match(/\[SSN_\d+\]/)[0];
    const r2 = C.redactString('Confirm SSN is 123-45-6789 correct?');
    expect(r2.result).toContain(ssnPh);
  });

  test('different PII values still get unique placeholders', () => {
    const r1 = C.redactString('My name is John Smith.');
    expect(r1.result).toContain('[NAME_1]');
    const r2 = C.redactString('Jane Doe is my colleague.');
    // Jane Doe should get a new placeholder, not reuse [NAME_1]
    expect(r2.result).toMatch(/\[NAME_\d+\]/);
    expect(r2.result).not.toContain('[NAME_1]');
  });

  test('mixed known and new PII in same text', () => {
    const r1 = C.redactString('Email john@example.com about the case.');
    const emailPh = r1.result.match(/\[EMAIL_\d+\]/)[0];
    // New text with same email + new phone
    const r2 = C.redactString('Call 555-867-5309 or email john@example.com.');
    expect(r2.result).toContain(emailPh); // reused
    expect(r2.result).toMatch(/\[PHONE_\d+\]/); // new
  });

  test('counter does not increment for reused values', () => {
    C.redactString('John Smith is a patient.');
    const counterAfterFirst = C.redactionCounter;
    C.redactString('Update records for John Smith.');
    expect(C.redactionCounter).toBe(counterAfterFirst);
  });

  test('redactionMap stays consistent across prompts', () => {
    C.redactString('Patient John Smith, SSN 123-45-6789.');
    const map1 = Object.assign({}, C.redactionMap);
    C.redactString('Verify John Smith SSN 123-45-6789.');
    // All original entries from map1 should still exist with same values
    for (var key in map1) {
      expect(C.redactionMap[key]).toEqual(map1[key]);
    }
  });

  test('clearing session resets map so values get fresh placeholders', () => {
    const r1 = C.redactString('My name is John Smith.');
    expect(r1.result).toContain('[NAME_1]');

    // Simulate CLOAKER_CLEAR: same as network-base.js handler
    C.redactionMap = {};
    C.redactionCounter = 0;
    C.clearScrubCache();

    // Same name now gets [NAME_1] again (fresh counter), not [NAME_40]
    const r2 = C.redactString('My name is John Smith.');
    expect(r2.result).toContain('[NAME_1]');
    expect(C.redactionCounter).toBe(1);
  });
});

// ─── AI Model / Platform Name Protection ────────────────────────────────────

describe('AI model names are not redacted', () => {
  beforeEach(() => {
    resetCloaker();
  });

  test.each([
    'claude-sonnet-4-6',
    'claude-3-5-sonnet-20241022',
    'claude-opus-4',
    'claude-haiku-3',
    'gpt-4o-mini',
    'gpt-4-turbo-preview',
    'gemini-1.5-flash',
    'gemini-2.0-pro',
    'llama-3.1-70b',
    'mistral-large-latest',
  ])('does not redact model identifier "%s"', (model) => {
    const r = C.redactString(model);
    expect(r.result).toBe(model);
    expect(r.items.length).toBe(0);
  });

  test.each([
    'Claude', 'Gemini', 'ChatGPT', 'Anthropic', 'Mistral', 'Copilot',
    'Sonnet', 'Opus', 'Haiku', 'Flash', 'Turbo',
  ])('does not redact standalone AI term "%s"', (term) => {
    const r = C.redactString('The ' + term + ' model is great.');
    expect(r.result).not.toMatch(/\[NAME_\d+\]/);
  });
});

// ─── deepRedactObj Key Skipping ─────────────────────────────────────────────

describe('deepRedactObj skips non-PII keys', () => {
  beforeEach(() => {
    resetCloaker();
  });

  test('skips model field in Claude-style request body', () => {
    const body = {
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'My SSN is 123-45-6789' }]
    };
    const r = C.deepRedactObj(body);
    expect(r.result.model).toBe('claude-sonnet-4-6');
    expect(r.result.messages[0].role).toBe('user');
    expect(r.result.messages[0].content).toContain('[SSN_');
    expect(r.result.messages[0].content).not.toContain('123-45-6789');
  });

  test('skips model field in ChatGPT-style request body', () => {
    const body = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Email me at john@test.com' }]
    };
    const r = C.deepRedactObj(body);
    expect(r.result.model).toBe('gpt-4o-mini');
    expect(r.result.messages[0].content).not.toContain('john@test.com');
  });

  test('skips conversation_id and parent_message_id', () => {
    const body = {
      conversation_id: 'abc-123-def-456',
      parent_message_id: 'xyz-789',
      content: 'Call me at 555-867-5309'
    };
    const r = C.deepRedactObj(body);
    expect(r.result.conversation_id).toBe('abc-123-def-456');
    expect(r.result.parent_message_id).toBe('xyz-789');
  });

  test('still redacts PII in non-skipped string fields', () => {
    const body = { text: 'John Smith, SSN 123-45-6789', model: 'gpt-4o' };
    const r = C.deepRedactObj(body);
    expect(r.result.text).not.toContain('123-45-6789');
    expect(r.result.model).toBe('gpt-4o');
  });
});
