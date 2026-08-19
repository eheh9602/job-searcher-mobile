/**
 * GET /api/detail?source=사람인&url=https%3A%2F%2F...
 *
 * 채용공고 상세페이지를 다시 읽어서
 * 회사명 / 근무지 / 고용형태 / 경력 / 학력 / 마감일
 * 주요업무 / 자격요건 / 우대사항 / 근무조건 등을 최대한 추출한다.
 *
 * v2
 */

"use strict";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/124.0 Safari/537.36",

  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

  "Accept-Language":
    "ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.5",
};


/* =========================================================
   공통
========================================================= */

async function fetchHtml(url, encoding = "utf-8") {
  const res = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();

  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}


function decodeEntities(str) {
  if (!str) return "";

  return String(str)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/gi, "/")
    .replace(/&#40;/gi, "(")
    .replace(/&#41;/gi, ")")
    .replace(/&#91;/gi, "[")
    .replace(/&#93;/gi, "]")
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(Number(code));
      } catch {
        return "";
      }
    });
}


function stripTags(str) {
  if (!str) return "";

  return decodeEntities(
    String(str)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function cleanText(str) {
  return stripTags(str || "")
    .replace(/\s+/g, " ")
    .trim();
}


function cleanMultiline(str) {
  return stripTags(str || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .join("\n")
    .trim();
}


function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = String(text || "").match(re);

    if (m && m[1]) {
      const value = cleanText(m[1]);

      if (value) return value;
    }
  }

  return "";
}


function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/* =========================================================
   기본 추론
========================================================= */

function inferCompanyFromTitle(title) {
  const text = cleanText(title);

  const m = text.match(/^\[([^\]]{2,50})\]/);

  if (m) {
    const company = m[1].trim();

    const generic = [
      "신입",
      "경력",
      "채용",
      "수시채용",
      "공채",
      "보건관리자",
      "안전관리자",
      "간호사",
    ];

    if (!generic.includes(company)) {
      return company;
    }
  }

  return "";
}


function inferJobTitle(title) {
  const text = cleanText(title);

  if (!text) return "";

  if (/보건관리자/i.test(text)) return "보건관리자";
  if (/산업간호사/i.test(text)) return "산업간호사";
  if (/안전관리자/i.test(text)) return "안전관리자";
  if (/간호사/i.test(text)) return "간호사";
  if (/산업위생/i.test(text)) return "산업위생";

  return text
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/채용.*$/i, "")
    .replace(/모집.*$/i, "")
    .trim()
    .slice(0, 40);
}


const REGIONS = [
  "서울",
  "경기",
  "인천",
  "부산",
  "대구",
  "대전",
  "광주",
  "울산",
  "세종",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
];


function inferLocation(text) {
  const t = cleanText(text);
  const regionPattern = REGIONS.join("|");

  const detailed = t.match(
    new RegExp(
      `(${regionPattern})\\s*(?:특별시|광역시|특별자치시|특별자치도|도)?\\s*([가-힣]{1,12}(?:시|군|구))`
    )
  );

  if (detailed) {
    return `${detailed[1]} ${detailed[2]}`;
  }

  const simple = t.match(
    new RegExp(`(${regionPattern})`)
  );

  return simple ? simple[1] : "";
}


function inferEmployment(text) {
  const t = cleanText(text);

  const types = [
    "정규직",
    "계약직",
    "인턴",
    "파견직",
    "프리랜서",
    "촉탁직",
    "위촉직",
    "시간제",
    "아르바이트",
  ];

  const found = types.filter((x) => t.includes(x));

  return found.slice(0, 2).join(" / ");
}


function inferExperience(text) {
  const t = cleanText(text);

  const patterns = [
    /경력무관/,
    /신입\s*[·\/,]?\s*경력/,
    /경력\s*\d+\s*[~-]\s*\d+\s*년/,
    /경력\s*\d+\s*년\s*이상/,
    /경력\s*\d+\s*년\s*↑/,
    /경력\s*\d+\s*년/,
    /신입/,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m) return m[0].replace(/\s+/g, "");
  }

  return "";
}


function inferEducation(text) {
  const t = cleanText(text);

  const values = [
    "학력무관",
    "고졸",
    "초대졸",
    "전문대졸",
    "대졸",
    "대학교졸업",
    "대학졸업",
    "석사",
    "박사",
  ];

  for (const value of values) {
    if (t.includes(value)) return value;
  }

  return "";
}


function inferDeadline(text) {
  const t = cleanText(text);

  if (/상시채용/.test(t)) return "상시채용";
  if (/채용시/.test(t)) return "채용시";
  if (/오늘마감/.test(t)) return "오늘마감";
  if (/내일마감/.test(t)) return "내일마감";

  const full = t.match(
    /(?:20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/
  );

  if (full) {
    return `${full[1].padStart(2, "0")}.${full[2].padStart(2, "0")}`;
  }

  const short = t.match(
    /~?\s*(\d{1,2})[./](\d{1,2})(?:\s*\([가-힣]\))?\s*(?:마감)?/
  );

  if (short) {
    return `${short[1].padStart(2, "0")}.${short[2].padStart(2, "0")}`;
  }

  return "";
}


/* =========================================================
   메타 태그
========================================================= */

function getMeta(html, property) {
  const escaped = escapeRegex(property);

  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${escaped}["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
  ];

  return firstMatch(html, patterns);
}


function getPageTitle(html) {
  return (
    getMeta(html, "og:title") ||
    firstMatch(html, [
      /<title[^>]*>([\s\S]*?)<\/title>/i,
      /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    ])
  );
}


/* =========================================================
   JSON-LD 파싱
========================================================= */

function parseJsonLd(html) {
  const blocks = [];

  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let m;

  while ((m = re.exec(html)) !== null) {
    const raw = m[1]
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .trim();

    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);

      if (Array.isArray(parsed)) {
        blocks.push(...parsed);
      } else if (parsed["@graph"]) {
        blocks.push(...parsed["@graph"]);
      } else {
        blocks.push(parsed);
      }
    } catch {
      // JSON-LD 오류는 무시
    }
  }

  return blocks;
}


function findJobPostingLd(html) {
  const blocks = parseJsonLd(html);

  return blocks.find((item) => {
    const type = item && item["@type"];

    return (
      type === "JobPosting" ||
      (Array.isArray(type) && type.includes("JobPosting"))
    );
  });
}


function parseLdLocation(jobLd) {
  try {
    const loc = Array.isArray(jobLd.jobLocation)
      ? jobLd.jobLocation[0]
      : jobLd.jobLocation;

    const address = loc?.address || {};

    const parts = [
      address.addressRegion,
      address.addressLocality,
    ].filter(Boolean);

    return parts.join(" ").trim();
  } catch {
    return "";
  }
}


/* =========================================================
   섹션 찾기
========================================================= */

function extractSectionFromText(fullText, headings) {
  const lines = String(fullText || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!lines.length) return "";

  const headingIndex = lines.findIndex((line) =>
    headings.some((h) => line.includes(h))
  );

  if (headingIndex < 0) return "";

  const stopWords = [
    "지원자격",
    "자격요건",
    "우대사항",
    "우대조건",
    "담당업무",
    "주요업무",
    "업무내용",
    "근무조건",
    "근무환경",
    "접수기간",
    "접수방법",
    "전형절차",
    "복리후생",
    "기업정보",
  ];

  const result = [];

  for (
    let i = headingIndex + 1;
    i < Math.min(lines.length, headingIndex + 15);
    i++
  ) {
    const line = lines[i];

    if (
      stopWords.some(
        (word) =>
          line.includes(word) &&
          !headings.some((h) => line.includes(h))
      )
    ) {
      break;
    }

    if (line.length > 1) {
      result.push(line);
    }
  }

  return result
    .slice(0, 8)
    .join("\n")
    .trim();
}


function normalizeSection(text) {
  if (!text) return "";

  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^[•·ㆍ\-–—※＊*▶▷▪■□○●]+\s*/, "")
        .trim()
    )
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, 8)
    .join("\n");
}


/* =========================================================
   사람인 상세
========================================================= */

function parseSaramin(html, originalUrl) {
  const text = cleanMultiline(html);
  const ld = findJobPostingLd(html);

  const pageTitle =
    ld?.title ||
    getPageTitle(html);

  let company =
    ld?.hiringOrganization?.name ||
    firstMatch(html, [
      /class=["'][^"']*company_name[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /class=["'][^"']*corp_name[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /class=["'][^"']*company-info[^"']*["'][\s\S]{0,500}?<strong[^>]*>([\s\S]*?)<\/strong>/i,
    ]) ||
    inferCompanyFromTitle(pageTitle);

  const location =
    parseLdLocation(ld || {}) ||
    inferLocation(text);

  const employment =
    cleanText(ld?.employmentType || "") ||
    inferEmployment(text);

  const experience =
    inferExperience(text);

  const education =
    inferEducation(text);

  let deadline = "";

  if (ld?.validThrough) {
    const d = String(ld.validThrough).match(
      /\d{4}-(\d{2})-(\d{2})/
    );

    if (d) deadline = `${d[1]}.${d[2]}`;
  }

  if (!deadline) deadline = inferDeadline(text);

  const duties =
    normalizeSection(
      extractSectionFromText(text, [
        "담당업무",
        "주요업무",
        "업무내용",
        "담당 업무",
      ])
    );

  const requirements =
    normalizeSection(
      extractSectionFromText(text, [
        "지원자격",
        "자격요건",
        "지원 자격",
        "필수사항",
      ])
    );

  const preferences =
    normalizeSection(
      extractSectionFromText(text, [
        "우대사항",
        "우대조건",
        "우대 사항",
      ])
    );

  const workConditions =
    normalizeSection(
      extractSectionFromText(text, [
        "근무조건",
        "근무환경",
        "근무 조건",
      ])
    );

  return {
    source: "사람인",
    company,
    title: pageTitle,
    jobTitle: inferJobTitle(pageTitle),
    location,
    employment,
    experience,
    education,
    deadline,
    duties,
    requirements,
    preferences,
    workConditions,
    url: originalUrl,
  };
}


/* =========================================================
   잡코리아 상세
========================================================= */

function parseJobkorea(html, originalUrl) {
  const text = cleanMultiline(html);
  const ld = findJobPostingLd(html);

  const pageTitle =
    ld?.title ||
    getPageTitle(html);

  const company =
    ld?.hiringOrganization?.name ||
    firstMatch(html, [
      /class=["'][^"']*coName[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /class=["'][^"']*company-name[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /class=["'][^"']*corpName[^"']*["'][^>]*>([\s\S]*?)<\//i,
    ]) ||
    inferCompanyFromTitle(pageTitle);

  const location =
    parseLdLocation(ld || {}) ||
    inferLocation(text);

  const employment =
    cleanText(ld?.employmentType || "") ||
    inferEmployment(text);

  const experience =
    inferExperience(text);

  const education =
    inferEducation(text);

  let deadline = "";

  if (ld?.validThrough) {
    const d = String(ld.validThrough).match(
      /\d{4}-(\d{2})-(\d{2})/
    );

    if (d) deadline = `${d[1]}.${d[2]}`;
  }

  if (!deadline) deadline = inferDeadline(text);

  const duties =
    normalizeSection(
      extractSectionFromText(text, [
        "담당업무",
        "주요업무",
        "업무내용",
      ])
    );

  const requirements =
    normalizeSection(
      extractSectionFromText(text, [
        "지원자격",
        "자격요건",
        "필수사항",
      ])
    );

  const preferences =
    normalizeSection(
      extractSectionFromText(text, [
        "우대사항",
        "우대조건",
      ])
    );

  const workConditions =
    normalizeSection(
      extractSectionFromText(text, [
        "근무조건",
        "근무환경",
      ])
    );

  return {
    source: "잡코리아",
    company,
    title: pageTitle,
    jobTitle: inferJobTitle(pageTitle),
    location,
    employment,
    experience,
    education,
    deadline,
    duties,
    requirements,
    preferences,
    workConditions,
    url: originalUrl,
  };
}


/* =========================================================
   인크루트 상세
========================================================= */

function parseIncruit(html, originalUrl) {
  const text = cleanMultiline(html);
  const ld = findJobPostingLd(html);

  const pageTitle =
    ld?.title ||
    getPageTitle(html);

  const company =
    ld?.hiringOrganization?.name ||
    firstMatch(html, [
      /class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /class=["'][^"']*cpname[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /class=["'][^"']*corp[^"']*["'][^>]*>([\s\S]*?)<\//i,
    ]) ||
    inferCompanyFromTitle(pageTitle);

  const location =
    parseLdLocation(ld || {}) ||
    inferLocation(text);

  const employment =
    cleanText(ld?.employmentType || "") ||
    inferEmployment(text);

  const experience =
    inferExperience(text);

  const education =
    inferEducation(text);

  let deadline = "";

  if (ld?.validThrough) {
    const d = String(ld.validThrough).match(
      /\d{4}-(\d{2})-(\d{2})/
    );

    if (d) deadline = `${d[1]}.${d[2]}`;
  }

  if (!deadline) deadline = inferDeadline(text);

  const duties =
    normalizeSection(
      extractSectionFromText(text, [
        "담당업무",
        "주요업무",
        "업무내용",
      ])
    );

  const requirements =
    normalizeSection(
      extractSectionFromText(text, [
        "지원자격",
        "자격요건",
        "필수사항",
      ])
    );

  const preferences =
    normalizeSection(
      extractSectionFromText(text, [
        "우대사항",
        "우대조건",
      ])
    );

  const workConditions =
    normalizeSection(
      extractSectionFromText(text, [
        "근무조건",
        "근무환경",
      ])
    );

  return {
    source: "인크루트",
    company,
    title: pageTitle,
    jobTitle: inferJobTitle(pageTitle),
    location,
    employment,
    experience,
    education,
    deadline,
    duties,
    requirements,
    preferences,
    workConditions,
    url: originalUrl,
  };
}


/* =========================================================
   결과 정리
========================================================= */

function sanitizeResult(result) {
  const cleaned = {};

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string") {
      const v = value.trim();

      cleaned[key] = /원문\s*확인/i.test(v)
        ? ""
        : v;
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}


/* =========================================================
   Cloudflare Pages Function
========================================================= */

export async function onRequestGet(context) {
  try {
    const requestUrl = new URL(context.request.url);

    const source =
      requestUrl.searchParams.get("source")?.trim() || "";

    const targetUrl =
      requestUrl.searchParams.get("url")?.trim() || "";

    if (!targetUrl) {
      return new Response(
        JSON.stringify({
          error: "공고 URL이 없습니다.",
        }),
        {
          status: 400,
          headers: {
            "content-type":
              "application/json; charset=utf-8",
          },
        }
      );
    }

    let parsedTarget;

    try {
      parsedTarget = new URL(targetUrl);
    } catch {
      throw new Error("잘못된 공고 URL입니다.");
    }

    /*
     * 아무 URL이나 서버가 fetch하는 SSRF 문제를 줄이기 위해
     * 허용 채용사이트만 호출
     */

    const allowedHosts = [
      "saramin.co.kr",
      "www.saramin.co.kr",
      "jobkorea.co.kr",
      "www.jobkorea.co.kr",
      "job.incruit.com",
      "incruit.com",
      "www.incruit.com",
    ];

    const allowed = allowedHosts.some(
      (host) =>
        parsedTarget.hostname === host ||
        parsedTarget.hostname.endsWith(`.${host}`)
    );

    if (!allowed) {
      throw new Error(
        "지원하지 않는 채용사이트입니다."
      );
    }

    let encoding = "utf-8";

    if (
      source === "인크루트" ||
      /incruit\.com$/i.test(parsedTarget.hostname)
    ) {
      encoding = "euc-kr";
    }

    const html = await fetchHtml(
      targetUrl,
      encoding
    );

    let result;

    if (
      source === "사람인" ||
      /saramin\.co\.kr$/i.test(parsedTarget.hostname)
    ) {
      result = parseSaramin(html, targetUrl);
    } else if (
      source === "잡코리아" ||
      /jobkorea\.co\.kr$/i.test(parsedTarget.hostname)
    ) {
      result = parseJobkorea(html, targetUrl);
    } else if (
      source === "인크루트" ||
      /incruit\.com$/i.test(parsedTarget.hostname)
    ) {
      result = parseIncruit(html, targetUrl);
    } else {
      throw new Error(
        "공고 출처를 확인할 수 없습니다."
      );
    }

    result = sanitizeResult(result);

    return new Response(
      JSON.stringify(
        {
          ok: true,
          detail: result,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: {
          "content-type":
            "application/json; charset=utf-8",

          "cache-control":
            "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify(
        {
          ok: false,
          error:
            error?.message ||
            "상세공고를 불러오지 못했습니다.",
        },
        null,
        2
      ),
      {
        status: 500,
        headers: {
          "content-type":
            "application/json; charset=utf-8",
        },
      }
    );
  }
}

