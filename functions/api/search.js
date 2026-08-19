"use strict";

/* =========================================================
   공통
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
  const re = new RegExp(
    `${name}\\s*=\\s*["']([^"']*)["']`,
    "i"
  );

  const match = String(tag || "").match(re);

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


function getContext(
  html,
  index,
  before = 1200,
  after = 2200
) {
  return html.slice(
    Math.max(0, index - before),
    Math.min(
      html.length,
      index + after
    )
  );
}


/* =========================================================
   검색 관련성 필터
========================================================= */

function normalizeKeyword(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(
      /[^가-힣a-z0-9]/g,
      ""
    );
}


function buildKeywordVariants(keyword) {
  const key = normalizeKeyword(keyword);

  const variants = new Set([key]);

  /*
   * 자주 쓰는 유사 표현
   */
  const aliases = {
    "보건관리자": [
      "보건관리자",
      "산업보건",
      "산업간호사",
      "보건담당자",
    ],

    "산업간호사": [
      "산업간호사",
      "보건관리자",
      "산업보건",
    ],

    "안전관리자": [
      "안전관리자",
      "산업안전",
      "안전담당자",
    ],

    "산업위생": [
      "산업위생",
      "산업위생관리기사",
      "작업환경",
    ],
  };

  for (const [
    base,
    items
  ] of Object.entries(aliases)) {

    if (
      normalizeKeyword(base) === key
    ) {

      items.forEach((item) =>
        variants.add(
          normalizeKeyword(item)
        )
      );

    }

  }

  return [...variants].filter(Boolean);
}


function relevanceScore(
  title,
  context,
  keyword
) {
  const titleNorm =
    normalizeKeyword(title);

  const contextNorm =
    normalizeKeyword(
      cleanText(context)
    );

  const variants =
    buildKeywordVariants(keyword);

  let score = 0;

  for (const variant of variants) {

    if (
      titleNorm.includes(variant)
    ) {
      score += 10;
    }

    if (
      contextNorm.includes(variant)
    ) {
      score += 2;
    }

  }

  return score;
}


function isRelevantJob(
  title,
  context,
  keyword
) {
  const score =
    relevanceScore(
      title,
      context,
      keyword
    );

  /*
   * 제목에 정확 키워드가 있으면 10점.
   * 주변 텍스트만 있으면 최대 몇 점 수준.
   *
   * 기본적으로 제목 일치를 강하게 우선.
   */

  return score >= 10;
}


/* =========================================================
   제목에서 회사명
========================================================= */

function inferCompanyFromTitle(title) {
  const text = cleanText(title);

  const match =
    text.match(
      /^\[([^\]]{2,50})\]/
    );

  if (!match) return "";

  return match[1].trim();
}


/* =========================================================
   부가정보 추론
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
  const t = cleanText(text);

  const regionPattern =
    REGIONS.join("|");

  const match = t.match(
    new RegExp(
      `(${regionPattern})\\s+([가-힣]{1,12}(?:시|군|구))`
    )
  );

  if (match) {
    return `${match[1]} ${match[2]}`;
  }

  const simple =
    t.match(
      new RegExp(
        `(${regionPattern})`
      )
    );

  return simple
    ? simple[1]
    : "";
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

  for (const type of types) {
    if (t.includes(type)) {
      return type;
    }
  }

  return "";
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

    if (m) {
      return m[0]
        .replace(/\s+/g, "");
    }
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
    "석사",
    "박사",
  ];

  for (const value of values) {
    if (t.includes(value)) {
      return value;
    }
  }

  return "";
}


function inferDeadline(text) {
  const t = cleanText(text);

  if (t.includes("상시채용")) {
    return "상시채용";
  }

  if (t.includes("채용시")) {
    return "채용시";
  }

  if (t.includes("오늘마감")) {
    return "오늘마감";
  }

  const match = t.match(
    /~?\s*(\d{1,2})[./](\d{1,2})(?:\s*\([가-힣]\))?/
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
   회사명 주변 추론
========================================================= */

function inferCompanyFromContext(
  context,
  source
) {
  const patterns =
    source === "사람인"
      ? [
          /class=["'][^"']*corp_name[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
          /class=["'][^"']*company_name[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
        ]

      : source === "잡코리아"
      ? [
          /class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
          /class=["'][^"']*corp[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
        ]

      : [
          /class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
          /class=["'][^"']*cpname[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
        ];

  for (const re of patterns) {
    const match =
      String(context || "")
        .match(re);

    if (match) {
      const company =
        cleanText(match[1]);

      if (
        company.length >= 2 &&
        company.length <= 60
      ) {
        return company;
      }
    }
  }

  return "";
}


/* =========================================================
   사람인
========================================================= */

async function searchSaramin(keyword) {
  const base =
    "https://www.saramin.co.kr";

  const url =
    `${base}/zf_user/search/recruit` +
    `?searchword=${encodeURIComponent(keyword)}` +
    `&recruitPage=1`;

  const html =
    await fetchHtml(
      url,
      "utf-8"
    );

  const jobs = [];
  const seen = new Set();

  /*
   * 사람인은 구조가 자주 바뀌어서
   * rec_idx 링크 자체를 우선 찾는다.
   */

  const re =
    /<a\b[^>]*href=["']([^"']*rec_idx=\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = re.exec(html)) !== null
  ) {

    const href =
      absoluteUrl(
        base,
        match[1]
      );

    if (
      !href ||
      seen.has(href)
    ) {
      continue;
    }

    const tag =
      match[0];

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

    const context =
      getContext(
        html,
        match.index,
        1600,
        2600
      );

    /*
     * 검색어가 제목에 실제로 없으면 제외
     */

    if (
      !isRelevantJob(
        title,
        context,
        keyword
      )
    ) {
      continue;
    }

    const company =
      inferCompanyFromContext(
        context,
        "사람인"
      ) ||
      inferCompanyFromTitle(
        title
      );

    seen.add(href);

    jobs.push({
      source: "사람인",
      company,
      title,
      location:
        inferLocation(context),

      employment:
        inferEmployment(context),

      experience:
        inferExperience(context),

      education:
        inferEducation(context),

      deadline:
        inferDeadline(context),

      url: href,
    });

    if (
      jobs.length >= 25
    ) {
      break;
    }
  }

  if (!jobs.length) {
    throw new Error(
      "사람인 검색결과를 찾지 못했습니다."
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
    `${base}/Search/` +
    `?stext=${encodeURIComponent(keyword)}`;

  const html =
    await fetchHtml(
      url,
      "utf-8"
    );

  const jobs = [];
  const seen = new Set();

  const re =
    /<a\b[^>]*href=["']([^"']*\/Recruit\/GI_Read\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = re.exec(html)) !== null
  ) {

    const href =
      absoluteUrl(
        base,
        match[1]
      );

    if (
      !href ||
      seen.has(href)
    ) {
      continue;
    }

    const tag =
      match[0];

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

    const context =
      getContext(
        html,
        match.index,
        1600,
        2800
      );

    if (
      !isRelevantJob(
        title,
        context,
        keyword
      )
    ) {
      continue;
    }

    const company =
      inferCompanyFromContext(
        context,
        "잡코리아"
      ) ||
      inferCompanyFromTitle(
        title
      );

    seen.add(href);

    jobs.push({
      source: "잡코리아",
      company,
      title,

      location:
        inferLocation(context),

      employment:
        inferEmployment(context),

      experience:
        inferExperience(context),

      education:
        inferEducation(context),

      deadline:
        inferDeadline(context),

      url: href,
    });

    if (
      jobs.length >= 25
    ) {
      break;
    }
  }

  if (!jobs.length) {
    throw new Error(
      "잡코리아 검색결과를 찾지 못했습니다."
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
    `?col=job_all` +
    `&kw=${encodeURIComponent(keyword)}`;

  const html =
    await fetchHtml(
      url,
      "euc-kr"
    );

  const jobs = [];
  const seen = new Set();

  const re =
    /<a\b[^>]*href=["']([^"']*jobdb_info\/jobpost\.asp[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match = re.exec(html)) !== null
  ) {

    const href =
      absoluteUrl(
        base,
        match[1]
      );

    if (
      !href ||
      seen.has(href)
    ) {
      continue;
    }

    const tag =
      match[0];

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

    const context =
      getContext(
        html,
        match.index,
        1500,
        2600
      );

    /*
     * 인크루트는 HOT/인기광고가 섞이므로
     * 제목 검색어 일치가 특히 중요
     */

    if (
      !isRelevantJob(
        title,
        context,
        keyword
      )
    ) {
      continue;
    }

    const company =
      inferCompanyFromContext(
        context,
        "인크루트"
      ) ||
      inferCompanyFromTitle(
        title
      );

    seen.add(href);

    jobs.push({
      source: "인크루트",
      company,
      title,

      location:
        inferLocation(context),

      employment:
        inferEmployment(context),

      experience:
        inferExperience(context),

      education:
        inferEducation(context),

      deadline:
        inferDeadline(context),

      url: href,
    });

    if (
      jobs.length >= 25
    ) {
      break;
    }
  }

  if (!jobs.length) {
    throw new Error(
      "인크루트 검색결과를 찾지 못했습니다."
    );
  }

  return jobs;
}


/* =========================================================
   중복 제거
========================================================= */

function dedupeJobs(jobs) {
  const seenUrls =
    new Set();

  const seenTitles =
    new Set();

  return jobs.filter((job) => {
    const urlKey =
      String(job.url || "")
        .toLowerCase();

    const titleKey =
      normalizeKeyword(
        `${job.company || ""}${job.title || ""}`
      );

    if (
      seenUrls.has(urlKey)
    ) {
      return false;
    }

    /*
     * 동일 사이트에서 비슷한 제목 반복도 제거
     */
    const titleSourceKey =
      `${job.source}|${titleKey}`;

    if (
      seenTitles.has(
        titleSourceKey
      )
    ) {
      return false;
    }

    seenUrls.add(urlKey);
    seenTitles.add(
      titleSourceKey
    );

    return true;
  });
}


/* =========================================================
   최종 안전필터
========================================================= */

function finalFilter(
  jobs,
  keyword
) {
  return jobs.filter((job) => {

    /*
     * 마지막으로 제목 자체에
     * 검색어/유사검색어가 있는지 재확인
     */

    const score =
      relevanceScore(
        job.title,
        "",
        keyword
      );

    return score >= 10;
  });
}


/* =========================================================
   API
========================================================= */

export async function onRequestGet(
  context
) {
  const requestUrl =
    new URL(context.request.url);

  const keyword =
    requestUrl
      .searchParams
      .get("keyword")
      ?.trim() ||
    "보건관리자";

  const tasks = [
    [
      "사람인",
      () =>
        searchSaramin(keyword),
    ],

    [
      "잡코리아",
      () =>
        searchJobkorea(keyword),
    ],

    [
      "인크루트",
      () =>
        searchIncruit(keyword),
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
          String(
            result.reason
          );

      }

    }
  );


  jobs =
    finalFilter(
      dedupeJobs(jobs),
      keyword
    );


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
