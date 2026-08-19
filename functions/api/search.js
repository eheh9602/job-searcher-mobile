"use strict";


/* =========================================================
   기본 헤더
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
   공통 유틸
========================================================= */

async function fetchHtml(
  url,
  encoding = "utf-8"
) {
  const response = await fetch(url, {
    headers: HEADERS,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  const buffer =
    await response.arrayBuffer();

  try {
    return new TextDecoder(
      encoding
    ).decode(buffer);
  } catch {
    return new TextDecoder(
      "utf-8"
    ).decode(buffer);
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
    .replace(
      /&#(\d+);/g,
      (_, code) => {
        try {
          return String.fromCharCode(
            Number(code)
          );
        } catch {
          return "";
        }
      }
    );
}


function stripTags(str) {
  return decodeEntities(
    String(str || "")
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<br\s*\/?>/gi,
        " "
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(/\s+/g, " ")
    .trim();
}


function cleanText(str) {
  return stripTags(str || "")
    .replace(/\s+/g, " ")
    .trim();
}


function getAttr(
  tag,
  name
) {
  const regex =
    new RegExp(
      `${name}\\s*=\\s*["']([^"']*)["']`,
      "i"
    );

  const match =
    String(tag || "").match(
      regex
    );

  return match
    ? decodeEntities(
        match[1]
      ).trim()
    : "";
}


function absoluteUrl(
  base,
  href
) {
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
  before = 1500,
  after = 3000
) {
  return html.slice(
    Math.max(
      0,
      index - before
    ),

    Math.min(
      html.length,
      index + after
    )
  );
}


/* =========================================================
   검색어 관련성
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


function buildKeywordVariants(
  keyword
) {
  const key =
    normalizeKeyword(keyword);

  const variants =
    new Set([key]);

  const aliasMap = {
    보건관리자: [
      "보건관리자",
      "산업보건",
      "산업간호사",
      "안전보건관리자",
    ],

    산업간호사: [
      "산업간호사",
      "보건관리자",
      "산업보건",
    ],

    안전관리자: [
      "안전관리자",
      "산업안전",
      "안전담당자",
      "안전보건관리자",
    ],

    산업위생: [
      "산업위생",
      "산업위생관리기사",
      "작업환경",
    ],
  };

  for (
    const [base, aliases]
    of Object.entries(
      aliasMap
    )
  ) {
    if (
      normalizeKeyword(base) ===
      key
    ) {
      aliases.forEach(
        (item) => {
          variants.add(
            normalizeKeyword(
              item
            )
          );
        }
      );
    }
  }

  return [
    ...variants,
  ].filter(Boolean);
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
    buildKeywordVariants(
      keyword
    );

  let score = 0;

  for (
    const variant
    of variants
  ) {
    if (
      titleNorm.includes(
        variant
      )
    ) {
      score += 10;
    }

    if (
      contextNorm.includes(
        variant
      )
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
  return (
    relevanceScore(
      title,
      context,
      keyword
    ) >= 10
  );
}


/* =========================================================
   회사명
========================================================= */

function inferCompanyFromTitle(
  title
) {
  const text =
    cleanText(title);

  const match =
    text.match(
      /^\[([^\]]{2,60})\]/
    );

  return match
    ? match[1].trim()
    : "";
}


function inferCompanyFromContext(
  context,
  source
) {
  const patterns =
    source === "사람인"
      ? [
          /class=["'][^"']*corp_name[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,

          /class=["'][^"']*company_name[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,

          /class=["'][^"']*company[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
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

  for (const regex of patterns) {
    const match =
      String(context || "")
        .match(regex);

    if (!match) continue;

    const company =
      cleanText(match[1]);

    if (
      company.length >= 2 &&
      company.length <= 60
    ) {
      return company;
    }
  }

  return "";
}


/* =========================================================
   부가정보
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
  const value =
    cleanText(text);

  const regionPattern =
    REGIONS.join("|");

  const detailed =
    value.match(
      new RegExp(
        `(${regionPattern})\\s+([가-힣]{1,12}(?:시|군|구|전체))`
      )
    );

  if (detailed) {
    return (
      `${detailed[1]} ` +
      `${detailed[2]}`
    );
  }

  const simple =
    value.match(
      new RegExp(
        `(${regionPattern})`
      )
    );

  return simple
    ? simple[1]
    : "";
}


function inferEmployment(text) {
  const value =
    cleanText(text);

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
    if (
      value.includes(type)
    ) {
      return type;
    }
  }

  return "";
}


function inferExperience(text) {
  const value =
    cleanText(text);

  const patterns = [
    /경력무관/,
    /신입\s*[·\/,]?\s*경력/,
    /경력\s*\d+\s*[~-]\s*\d+\s*년/,
    /경력\s*\d+\s*년\s*이상/,
    /경력\s*\d+\s*년\s*↑/,
    /경력\s*\d+\s*년/,
    /신입/,
    /경력/,
  ];

  for (const regex of patterns) {
    const match =
      value.match(regex);

    if (match) {
      return match[0]
        .replace(
          /\s+/g,
          ""
        );
    }
  }

  return "";
}


function inferEducation(text) {
  const value =
    cleanText(text);

  const levels = [
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

  for (const level of levels) {
    if (
      value.includes(level)
    ) {
      return level;
    }
  }

  return "";
}


function inferDeadline(text) {
  const value =
    cleanText(text);

  if (
    value.includes(
      "상시채용"
    )
  ) {
    return "상시채용";
  }

  if (
    value.includes(
      "채용시"
    )
  ) {
    return "채용시";
  }

  if (
    value.includes(
      "오늘마감"
    )
  ) {
    return "오늘마감";
  }

  if (
    value.includes(
      "내일마감"
    )
  ) {
    return "내일마감";
  }

  const date =
    value.match(
      /~\s*(\d{1,2})[./](\d{1,2})/
    );

  if (date) {
    return (
      `${date[1].padStart(2, "0")}.` +
      `${date[2].padStart(2, "0")}`
    );
  }

  return "";
}


/* =========================================================
   사람인 카테고리
========================================================= */

function getSaraminCategory(
  keyword
) {
  const normalized =
    normalizeKeyword(keyword);

  /*
   * 확인된 사람인 직무 category ID
   */

  if (
    normalized ===
    normalizeKeyword(
      "보건관리자"
    )
  ) {
    return "2027";
  }

  if (
    normalized ===
    normalizeKeyword(
      "산업간호사"
    )
  ) {
    /*
     * 산업간호사는 보건관리자 직무군에서 같이 찾는다.
     */
    return "2027";
  }

  if (
    normalized ===
    normalizeKeyword(
      "안전관리자"
    )
  ) {
    return "2037";
  }

  return "";
}


/* =========================================================
   사람인
========================================================= */

async function searchSaramin(
  keyword
) {
  const base =
    "https://www.saramin.co.kr";

  const categoryId =
    getSaraminCategory(
      keyword
    );

  let url;

  if (categoryId) {
    url =
      `${base}/zf_user/jobs/list/job-category` +
      `?cat_kewd=${categoryId}`;
  } else {
    url =
      `${base}/zf_user/search/recruit` +
      `?searchword=${encodeURIComponent(keyword)}` +
      `&recruitPage=1`;
  }

  const html =
    await fetchHtml(
      url,
      "utf-8"
    );

  const jobs = [];
  const seen =
    new Set();


  /*
   * 사람인 상세공고 링크는 보통
   * /zf_user/jobs/relay/view?rec_idx=...
   */

  const linkRegex =
    /<a\b[^>]*href=["']([^"']*(?:jobs\/relay\/view|rec_idx=\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match =
      linkRegex.exec(html))
    !== null
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

    let title =
      cleanText(
        getAttr(
          tag,
          "title"
        )
      );

    if (!title) {
      title =
        cleanText(
          match[2]
        );
    }

    /*
     * 사람인 리스트에는 같은 공고 URL에
     * 회사명/스크랩 등의 다른 링크가 섞일 수 있으므로
     * 너무 짧은 텍스트는 버림
     */

    if (
      !title ||
      title.length < 5
    ) {
      continue;
    }

    const context =
      getContext(
        html,
        match.index,
        2200,
        4200
      );


    /*
     * 카테고리 검색은 직무분류 자체가 이미 관련성이 있으므로
     * 일반검색보다 조금 느슨하게 통과.
     *
     * 단 산업간호사처럼 별도 키워드 검색을 원할 때는
     * 실제 제목/주변 직무텍스트 관련성도 본다.
     */

    const normalized =
      normalizeKeyword(
        keyword
      );

    let relevant = true;

    if (
      normalized ===
      normalizeKeyword(
        "산업간호사"
      )
    ) {
      const surrounding =
        cleanText(context);

      relevant =
        normalizeKeyword(
          title +
          " " +
          surrounding
        ).includes(
          normalizeKeyword(
            "산업간호사"
          )
        ) ||
        normalizeKeyword(
          title
        ).includes(
          normalizeKeyword(
            "보건관리자"
          )
        );
    }

    if (
      !categoryId &&
      !isRelevantJob(
        title,
        context,
        keyword
      )
    ) {
      relevant = false;
    }

    if (!relevant) {
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
      source:
        "사람인",

      company,

      title,

      location:
        inferLocation(
          context
        ),

      employment:
        inferEmployment(
          context
        ),

      experience:
        inferExperience(
          context
        ),

      education:
        inferEducation(
          context
        ),

      deadline:
        inferDeadline(
          context
        ),

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
      `사람인 ${keyword} 공고를 찾지 못했습니다.`
    );
  }

  return jobs;
}


/* =========================================================
   잡코리아
========================================================= */

async function searchJobkorea(
  keyword
) {
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

  const seen =
    new Set();

  const regex =
    /<a\b[^>]*href=["']([^"']*\/Recruit\/GI_Read\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match =
      regex.exec(html))
    !== null
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
        getAttr(
          tag,
          "title"
        )
      ) ||
      cleanText(
        match[2]
      );

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
      source:
        "잡코리아",

      company,

      title,

      location:
        inferLocation(
          context
        ),

      employment:
        inferEmployment(
          context
        ),

      experience:
        inferExperience(
          context
        ),

      education:
        inferEducation(
          context
        ),

      deadline:
        inferDeadline(
          context
        ),

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

async function searchIncruit(
  keyword
) {
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

  const seen =
    new Set();

  const regex =
    /<a\b[^>]*href=["']([^"']*jobdb_info\/jobpost\.asp[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match =
      regex.exec(html))
    !== null
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
        getAttr(
          tag,
          "title"
        )
      ) ||
      cleanText(
        match[2]
      );

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
      source:
        "인크루트",

      company,

      title,

      location:
        inferLocation(
          context
        ),

      employment:
        inferEmployment(
          context
        ),

      experience:
        inferExperience(
          context
        ),

      education:
        inferEducation(
          context
        ),

      deadline:
        inferDeadline(
          context
        ),

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

  return jobs.filter(
    (job) => {
      const urlKey =
        String(
          job.url || ""
        ).toLowerCase();

      const titleKey =
        `${job.source}|` +
        normalizeKeyword(
          `${job.company || ""}` +
          `${job.title || ""}`
        );

      if (
        seenUrls.has(
          urlKey
        )
      ) {
        return false;
      }

      if (
        seenTitles.has(
          titleKey
        )
      ) {
        return false;
      }

      seenUrls.add(
        urlKey
      );

      seenTitles.add(
        titleKey
      );

      return true;
    }
  );
}


/* =========================================================
   API
========================================================= */

export async function onRequestGet(
  context
) {
  const requestUrl =
    new URL(
      context.request.url
    );

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
        searchSaramin(
          keyword
        ),
    ],

    [
      "잡코리아",
      () =>
        searchJobkorea(
          keyword
        ),
    ],

    [
      "인크루트",
      () =>
        searchIncruit(
          keyword
        ),
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
    (
      result,
      index
    ) => {
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
          result.reason
            ?.message ||
          String(
            result.reason
          );
      }
    }
  );


  jobs =
    dedupeJobs(
      jobs
    );


  return new Response(
    JSON.stringify(
      {
        keyword,
        count:
          jobs.length,
        jobs,
        errors,
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
}
