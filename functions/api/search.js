"use strict";

/* =========================================================
   기본 설정
========================================================= */

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
   Fetch
========================================================= */

async function fetchHtml(url, encoding = "utf-8") {
  const response = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const buffer = await response.arrayBuffer();

  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}


/* =========================================================
   HTML 정리
========================================================= */

function decodeEntities(str) {
  return String(str || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(Number(code));
      } catch {
        return "";
      }
    });
}


function stripTags(str) {
  return decodeEntities(
    String(str || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/li>/gi, " ")
      .replace(/<\/div>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}


function cleanText(str) {
  return stripTags(str || "")
    .replace(/\s+/g, " ")
    .trim();
}


function getAttr(tag, name) {
  const regex = new RegExp(
    `${name}\\s*=\\s*["']([^"']*)["']`,
    "i"
  );

  const match = String(tag || "").match(regex);

  return match
    ? decodeEntities(match[1]).trim()
    : "";
}


function absoluteUrl(base, href) {
  try {
    return new URL(
      decodeEntities(href),
      base
    ).toString();
  } catch {
    return "";
  }
}


/* =========================================================
   검색어
========================================================= */

function normalizeKeyword(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^가-힣a-z0-9]/g, "");
}


function getRoleTerms(keyword) {
  const key = normalizeKeyword(keyword);

  if (key === normalizeKeyword("보건관리자")) {
    return [
      "보건관리자",
      "산업보건",
      "산업간호사",
      "안전보건관리자",
      "보건담당자",
    ];
  }

  if (key === normalizeKeyword("산업간호사")) {
    return [
      "산업간호사",
      "보건관리자",
      "산업보건",
    ];
  }

  if (key === normalizeKeyword("안전관리자")) {
    return [
      "안전관리자",
      "산업안전",
      "안전보건관리자",
      "안전담당자",
    ];
  }

  if (key === normalizeKeyword("산업위생")) {
    return [
      "산업위생",
      "산업위생관리기사",
      "작업환경측정",
    ];
  }

  return [keyword];
}


function containsRole(text, keyword) {
  const normalized = normalizeKeyword(
    cleanText(text)
  );

  return getRoleTerms(keyword).some((term) =>
    normalized.includes(
      normalizeKeyword(term)
    )
  );
}


/* =========================================================
   사람인 카드 단위 추출
========================================================= */

function getSaraminCard(html, anchorIndex) {
  /*
   * 사람인 HTML 구조가 바뀌더라도
   * 공고를 감싸는 흔한 container class들을 순서대로 시도.
   */

  const containerNames = [
    "item_recruit",
    "recruit_item",
    "list_item",
    "job_item",
  ];

  const before = html.slice(
    Math.max(0, anchorIndex - 8000),
    anchorIndex
  );

  for (const className of containerNames) {
    const regex = new RegExp(
      `<(?:div|li)[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>`,
      "gi"
    );

    let match;
    let last = null;

    while ((match = regex.exec(before)) !== null) {
      last = match;
    }

    if (last) {
      const start =
        Math.max(0, anchorIndex - 8000) +
        last.index;

      /*
       * 같은 container의 대략적인 끝까지만 사용.
       */
      const after = html.slice(
        start,
        Math.min(html.length, start + 9000)
      );

      const closingCandidates = [
        "</li>",
        "</article>",
      ];

      let end = -1;

      for (const closing of closingCandidates) {
        const index = after.indexOf(closing);

        if (
          index !== -1 &&
          (end === -1 || index < end)
        ) {
          end = index + closing.length;
        }
      }

      if (end !== -1) {
        return after.slice(0, end);
      }

      return after.slice(0, 4500);
    }
  }

  /*
   * container 못 찾았을 때만 매우 좁은 fallback.
   * 이전처럼 앞뒤 수천 자를 보는 방식은 쓰지 않는다.
   */
  return html.slice(
    Math.max(0, anchorIndex - 450),
    Math.min(html.length, anchorIndex + 1050)
  );
}


/* =========================================================
   제목 회사명
========================================================= */

function inferCompanyFromTitle(title) {
  const text = cleanText(title);

  const match = text.match(
    /^\[([^\]]{2,60})\]/
  );

  return match
    ? match[1].trim()
    : "";
}


function inferCompanyFromBlock(block, source) {
  let patterns = [];

  if (source === "사람인") {
    patterns = [
      /class=["'][^"']*corp_name[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
      /class=["'][^"']*company_name[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    ];
  }

  if (source === "잡코리아") {
    patterns = [
      /class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
      /class=["'][^"']*corp[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    ];
  }

  if (source === "인크루트") {
    patterns = [
      /class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
      /class=["'][^"']*cpname[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    ];
  }

  for (const regex of patterns) {
    const match = String(block || "").match(regex);

    if (!match) continue;

    const value = cleanText(match[1]);

    if (
      value.length >= 2 &&
      value.length <= 60
    ) {
      return value;
    }
  }

  return "";
}


/* =========================================================
   지역
========================================================= */

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
  const value = cleanText(text);

  const regionPattern = REGIONS.join("|");

  const detailed = value.match(
    new RegExp(
      `(${regionPattern})\\s*([가-힣]{1,12}(?:시|군|구))`
    )
  );

  if (detailed) {
    return `${detailed[1]} ${detailed[2]}`;
  }

  const simple = value.match(
    new RegExp(`(${regionPattern})`)
  );

  return simple ? simple[1] : "";
}


/* =========================================================
   고용형태
========================================================= */

function inferEmployment(text) {
  const value = cleanText(text);

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

  for (const type of types) {
    if (value.includes(type)) {
      return type;
    }
  }

  return "";
}


/* =========================================================
   경력
========================================================= */

function inferExperience(text) {
  const value = cleanText(text);

  const patterns = [
    /경력무관/,
    /신입\s*[·\/,]?\s*경력/,
    /경력\s*\d+\s*[~-]\s*\d+\s*년/,
    /경력\s*\d+\s*년\s*이상/,
    /경력\s*\d+\s*년\s*↑/,
    /경력\s*\d+\s*년/,
    /신입/,
  ];

  for (const regex of patterns) {
    const match = value.match(regex);

    if (match) {
      return match[0]
        .replace(/\s+/g, "");
    }
  }

  return "";
}


/* =========================================================
   학력
========================================================= */

function inferEducation(text) {
  const value = cleanText(text);

  const values = [
    "학력무관",
    "고졸",
    "고졸↑",
    "대학(2,3년)↑",
    "전문대졸",
    "초대졸",
    "대학교(4년)↑",
    "대졸",
    "석사",
    "박사",
  ];

  for (const item of values) {
    if (value.includes(item)) {
      return item;
    }
  }

  return "";
}


/* =========================================================
   마감
========================================================= */

function inferDeadline(text) {
  const value = cleanText(text);

  if (value.includes("상시채용")) {
    return "상시채용";
  }

  if (value.includes("채용시")) {
    return "채용시";
  }

  if (value.includes("오늘마감")) {
    return "오늘마감";
  }

  if (value.includes("내일마감")) {
    return "내일마감";
  }

  const match = value.match(
    /~\s*(\d{1,2})[./](\d{1,2})/
  );

  if (match) {
    return (
      `${match[1].padStart(2, "0")}.` +
      `${match[2].padStart(2, "0")}`
    );
  }

  return "";
}


/* =========================================================
   광고성/무관 제목
========================================================= */

function looksLikeNoise(title, keyword, block) {
  const t = cleanText(title);

  /*
   * 제목 자체는 전혀 관계없고
   * 카드에도 관련 직무가 없다면 제거.
   */
  if (
    !containsRole(t, keyword) &&
    !containsRole(block, keyword)
  ) {
    return true;
  }

  /*
   * TOP100/서비스지원 같은 제목은
   * 카드 안에 정확한 직무 태그가 있을 때만 허용.
   */
  const genericPatterns = [
    /TOP100/i,
    /서비스\s*지원/i,
    /생산\s*지원/i,
    /제조운영/i,
    /각\s*부문/i,
    /각\s*분야/i,
    /신입\/경력\s*사원/i,
  ];

  const generic = genericPatterns.some((regex) =>
    regex.test(t)
  );

  if (
    generic &&
    !containsRole(block, keyword)
  ) {
    return true;
  }

  return false;
}


/* =========================================================
   사람인 카테고리
========================================================= */

function getSaraminCategory(keyword) {
  const key = normalizeKeyword(keyword);

  if (
    key === normalizeKeyword("보건관리자") ||
    key === normalizeKeyword("산업간호사")
  ) {
    return "2027";
  }

  if (
    key === normalizeKeyword("안전관리자")
  ) {
    return "2037";
  }

  return "";
}


/* =========================================================
   사람인
========================================================= */

async function searchSaramin(keyword) {
  const base =
    "https://www.saramin.co.kr";

  const category =
    getSaraminCategory(keyword);

  const url = category
    ? `${base}/zf_user/jobs/list/job-category?cat_kewd=${category}`
    : `${base}/zf_user/search/recruit?searchword=${encodeURIComponent(keyword)}&recruitPage=1`;

  const html = await fetchHtml(
    url,
    "utf-8"
  );

  const jobs = [];
  const seen = new Set();

  const regex =
    /<a\b[^>]*href=["']([^"']*(?:jobs\/relay\/view|rec_idx=\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = absoluteUrl(
      base,
      match[1]
    );

    if (
      !href ||
      seen.has(href)
    ) {
      continue;
    }

    const tag = match[0];

    const title =
      cleanText(
        getAttr(tag, "title")
      ) ||
      cleanText(match[2]);

    if (
      !title ||
      title.length < 5
    ) {
      continue;
    }

    /*
     * ★ 공고 하나에 해당하는 영역만 사용.
     */
    const block = getSaraminCard(
      html,
      match.index
    );

    /*
     * ★ 핵심 필터.
     */
    if (
      looksLikeNoise(
        title,
        keyword,
        block
      )
    ) {
      continue;
    }

    const company =
      inferCompanyFromBlock(
        block,
        "사람인"
      ) ||
      inferCompanyFromTitle(title);

    seen.add(href);

    jobs.push({
      source: "사람인",
      company,
      title,

      location:
        inferLocation(block),

      employment:
        inferEmployment(block),

      experience:
        inferExperience(block),

      education:
        inferEducation(block),

      deadline:
        inferDeadline(block),

      url: href,
    });

    if (jobs.length >= 30) {
      break;
    }
  }

  if (!jobs.length) {
    throw new Error(
      `사람인 ${keyword} 관련 공고를 찾지 못했습니다.`
    );
  }

  return jobs;
}


/* =========================================================
   잡코리아
========================================================= */

async function searchJobkorea(keyword) {
  const base =
    "https://www.jobkorea.co.kr";

  const url =
    `${base}/Search/?stext=${encodeURIComponent(keyword)}`;

  const html = await fetchHtml(
    url,
    "utf-8"
  );

  const jobs = [];
  const seen = new Set();

  const regex =
    /<a\b[^>]*href=["']([^"']*\/Recruit\/GI_Read\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = absoluteUrl(
      base,
      match[1]
    );

    if (
      !href ||
      seen.has(href)
    ) {
      continue;
    }

    const tag = match[0];

    const title =
      cleanText(
        getAttr(tag, "title")
      ) ||
      cleanText(match[2]);

    if (
      !title ||
      title.length < 4
    ) {
      continue;
    }

    /*
     * 잡코리아는 제목 관련성을 강하게 본다.
     */
    if (
      !containsRole(
        title,
        keyword
      )
    ) {
      continue;
    }

    const block = html.slice(
      Math.max(0, match.index - 700),
      Math.min(
        html.length,
        match.index + 1500
      )
    );

    const company =
      inferCompanyFromBlock(
        block,
        "잡코리아"
      ) ||
      inferCompanyFromTitle(title);

    seen.add(href);

    jobs.push({
      source: "잡코리아",
      company,
      title,

      location:
        inferLocation(block),

      employment:
        inferEmployment(block),

      experience:
        inferExperience(block),

      education:
        inferEducation(block),

      deadline:
        inferDeadline(block),

      url: href,
    });

    if (jobs.length >= 30) {
      break;
    }
  }

  if (!jobs.length) {
    throw new Error(
      "잡코리아 관련 공고를 찾지 못했습니다."
    );
  }

  return jobs;
}


/* =========================================================
   인크루트
========================================================= */

async function searchIncruit(keyword) {
  const base =
    "https://job.incruit.com";

  const url =
    `${base}/jobdb_list/searchjob.asp` +
    `?col=job_all&kw=${encodeURIComponent(keyword)}`;

  const html = await fetchHtml(
    url,
    "euc-kr"
  );

  const jobs = [];
  const seen = new Set();

  const regex =
    /<a\b[^>]*href=["']([^"']*jobdb_info\/jobpost\.asp[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = absoluteUrl(
      base,
      match[1]
    );

    if (
      !href ||
      seen.has(href)
    ) {
      continue;
    }

    const tag = match[0];

    const title =
      cleanText(
        getAttr(tag, "title")
      ) ||
      cleanText(match[2]);

    if (
      !title ||
      title.length < 4
    ) {
      continue;
    }

    /*
     * 인크루트는 HOT 공고 영역이 섞여 있어서
     * 제목 안에 직무 관련 단어가 있어야만 통과.
     */
    if (
      !containsRole(
        title,
        keyword
      )
    ) {
      continue;
    }

    const block = html.slice(
      Math.max(0, match.index - 700),
      Math.min(
        html.length,
        match.index + 1500
      )
    );

    const company =
      inferCompanyFromBlock(
        block,
        "인크루트"
      ) ||
      inferCompanyFromTitle(title);

    seen.add(href);

    jobs.push({
      source: "인크루트",
      company,
      title,

      location:
        inferLocation(block),

      employment:
        inferEmployment(block),

      experience:
        inferExperience(block),

      education:
        inferEducation(block),

      deadline:
        inferDeadline(block),

      url: href,
    });

    if (jobs.length >= 30) {
      break;
    }
  }

  if (!jobs.length) {
    throw new Error(
      "인크루트 관련 공고를 찾지 못했습니다."
    );
  }

  return jobs;
}


/* =========================================================
   중복
========================================================= */

function dedupeJobs(jobs) {
  const urls = new Set();
  const titles = new Set();

  return jobs.filter((job) => {
    const urlKey =
      String(job.url || "")
        .toLowerCase();

    const titleKey =
      `${job.source}|` +
      normalizeKeyword(
        `${job.company || ""}${job.title || ""}`
      );

    if (urls.has(urlKey)) {
      return false;
    }

    if (titles.has(titleKey)) {
      return false;
    }

    urls.add(urlKey);
    titles.add(titleKey);

    return true;
  });
}


/* =========================================================
   API
========================================================= */

export async function onRequestGet(context) {
  const requestUrl =
    new URL(context.request.url);

  const keyword =
    requestUrl.searchParams
      .get("keyword")
      ?.trim() ||
    "보건관리자";

  const tasks = [
    [
      "사람인",
      () => searchSaramin(keyword),
    ],
    [
      "잡코리아",
      () => searchJobkorea(keyword),
    ],
    [
      "인크루트",
      () => searchIncruit(keyword),
    ],
  ];

  const results =
    await Promise.allSettled(
      tasks.map(
        ([, fn]) => fn()
      )
    );

  let jobs = [];
  const errors = {};

  results.forEach(
    (result, index) => {
      const source =
        tasks[index][0];

      if (
        result.status ===
        "fulfilled"
      ) {
        jobs.push(
          ...result.value
        );
      } else {
        errors[source] =
          result.reason?.message ||
          String(result.reason);
      }
    }
  );

  jobs = dedupeJobs(jobs);

  return new Response(
    JSON.stringify(
      {
        keyword,
        count: jobs.length,
        jobs,
        errors,
      },
      null,
      2
    ),
    {
      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          "no-store, max-age=0",
      },
    }
  );
}
