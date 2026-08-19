"use strict";

/* =========================================================
   상태
========================================================= */

let currentJobs = [];
let selectedJob = null;
let detailLoading = null;
let lastSearchKeyword = "보건관리자";

const $ = (id) => document.getElementById(id);


/* =========================================================
   토스트
========================================================= */

function showToast(message) {
  const el = $("toast");

  if (!el) return;

  el.textContent = message;
  el.classList.remove("hidden");

  clearTimeout(showToast._timer);

  showToast._timer = setTimeout(() => {
    el.classList.add("hidden");
  }, 2200);
}


/* =========================================================
   기본 문자열 정리
========================================================= */

function escapeHtml(str) {
  return String(str || "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[char])
  );
}


function cleanValue(value) {
  const text = String(value || "").trim();

  if (!text) return "";

  const invalidValues = [
    "원문 확인",
    "회사명 원문 확인",
    "회사명 확인",
    "지역 원문 확인",
    "경력 원문 확인",
    "마감 원문 확인",
    "고용형태 확인",
    "접수마감 확인",
    "확인 필요",
    "undefined",
    "null",
    "n/a",
  ];

  const normalized = text.toLowerCase();

  if (
    invalidValues.some(
      (item) =>
        normalized === item.toLowerCase()
    )
  ) {
    return "";
  }

  return text;
}


function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanValue(value);

    if (cleaned) return cleaned;
  }

  return "";
}


function escapeRegExp(value) {
  return String(value || "").replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}


/* =========================================================
   제목 / 회사명
========================================================= */

function normalizeTitle(title) {
  let text = cleanValue(title);

  if (!text) return "";

  return text
    .replace(
      /\s*[-|]\s*(사람인|잡코리아|인크루트).*$/i,
      ""
    )
    .replace(/\s*::\s*.*$/i, "")
    .trim();
}


function inferCompanyFromTitle(title) {
  const text = normalizeTitle(title);

  const match = text.match(
    /^\[([^\]]{2,60})\]/
  );

  return match
    ? match[1].trim()
    : "";
}


function companyName(job) {
  return firstValue(
    job?.company,
    inferCompanyFromTitle(job?.title)
  );
}


/* =========================================================
   직무 판별
========================================================= */

function findRepresentativeJobLabel(text) {
  const value = String(text || "");

  const rules = [
    [/안전보건관리자/i, "안전보건관리자"],
    [/보건관리자/i, "보건관리자"],
    [/산업간호사/i, "산업간호사"],
    [/안전관리자/i, "안전관리자"],
    [/산업위생관리자/i, "산업위생관리자"],
    [/산업위생/i, "산업위생"],
    [/간호사/i, "간호사"],
    [/환경관리/i, "환경관리"],
    [/시설관리/i, "시설관리"],
    [/현장관리/i, "현장관리"],
    [/인테리어\s*설계/i, "인테리어 설계"],
    [/품질관리/i, "품질관리"],
  ];

  for (const [regex, label] of rules) {
    if (regex.test(value)) {
      return label;
    }
  }

  return "";
}


function normalizeSearchKeyword(keyword) {
  const value = String(keyword || "").trim();

  if (/보건관리자/i.test(value)) {
    return "보건관리자";
  }

  if (/산업간호사/i.test(value)) {
    return "산업간호사";
  }

  if (/안전관리자/i.test(value)) {
    return "안전관리자";
  }

  if (/산업위생/i.test(value)) {
    return "산업위생";
  }

  return "";
}


function guessJobLabel(job) {
  /*
   * 1순위:
   * 사용자가 실제 검색한 직무.
   *
   * 예:
   * 대한조선 "2026 신입/경력 상시모집"
   * → 보건관리자로 검색했다면
   *   썸네일은 보건관리자.
   */
  const searched =
    normalizeSearchKeyword(
      job?.searchKeyword
    );

  if (searched) {
    return searched;
  }

  /*
   * 2순위: 상세페이지 직무명
   */
  const detailLabel =
    findRepresentativeJobLabel(
      job?.jobTitle
    );

  if (detailLabel) {
    return detailLabel;
  }

  /*
   * 3순위: 제목
   */
  const titleLabel =
    findRepresentativeJobLabel(
      job?.title
    );

  if (titleLabel) {
    return titleLabel;
  }

  /*
   * 4순위: 업무내용
   */
  const dutyLabel =
    findRepresentativeJobLabel(
      job?.duties
    );

  if (dutyLabel) {
    return dutyLabel;
  }

  return "채용";
}


/* =========================================================
   통합채용/공채 제목 판별
========================================================= */

function isGenericRecruitmentTitle(title) {
  const text = normalizeTitle(title);

  if (!text) return false;

  const patterns = [
    /신입.*경력.*사원.*채용/i,
    /신입.*경력.*사원.*모집/i,
    /신입.*경력.*상시/i,
    /각\s*부문.*채용/i,
    /각\s*부문.*모집/i,
    /전\s*부문.*채용/i,
    /전\s*부문.*모집/i,
    /공개채용/i,
    /공채/i,
    /상시\s*채용/i,
    /상시\s*모집/i,
  ];

  return patterns.some(
    (regex) => regex.test(text)
  );
}


/* =========================================================
   고용형태
========================================================= */

function normalizeEmployment(value) {
  const original = cleanValue(value);

  if (!original) return "";

  const upper = original.toUpperCase();

  const mappings = [
    [
      [
        "FULL_TIME",
        "FULLTIME",
        "PERMANENT",
        "REGULAR",
      ],
      "정규직",
    ],
    [
      [
        "CONTRACTOR",
        "CONTRACT",
        "CONTRACTED",
        "FIXED_TERM",
      ],
      "계약직",
    ],
    [
      ["PART_TIME", "PARTTIME"],
      "시간제",
    ],
    [
      ["INTERN", "INTERNSHIP"],
      "인턴",
    ],
    [
      ["TEMPORARY", "TEMP"],
      "파견직",
    ],
  ];

  for (const [codes, korean] of mappings) {
    if (
      codes.some(
        (code) => upper.includes(code)
      )
    ) {
      return korean;
    }
  }

  const koreanTypes = [
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

  for (const type of koreanTypes) {
    if (original.includes(type)) {
      return type;
    }
  }

  return original;
}


function guessEmploymentType(job) {
  const direct =
    normalizeEmployment(
      job?.employment
    );

  if (direct) return direct;

  const text = [
    job?.title,
    job?.experience,
    job?.workConditions,
  ]
    .filter(Boolean)
    .join(" ");

  const types = [
    "정규직",
    "계약직",
    "인턴",
    "파견직",
    "프리랜서",
    "촉탁직",
    "위촉직",
    "시간제",
  ];

  for (const type of types) {
    if (text.includes(type)) {
      return type;
    }
  }

  return "";
}


/* =========================================================
   경력
========================================================= */

function normalizeExperience(value) {
  let text = cleanValue(value);

  if (!text) return "";

  text = text
    .replace(
      /EXPERIENCE_NOT_REQUIRED/gi,
      "경력무관"
    )
    .replace(
      /NO_EXPERIENCE/gi,
      "경력무관"
    )
    .replace(
      /ENTRY_LEVEL/gi,
      "신입"
    )
    .replace(
      /NEWCOMER/gi,
      "신입"
    )
    .replace(
      /EXPERIENCED/gi,
      "경력"
    );

  text = text
    .replace(/\s*[,/]\s*/g, "·")
    .replace(
      /신입\s*·\s*경력/g,
      "신입·경력"
    )
    .replace(/\s+/g, " ")
    .trim();

  return text;
}


/* =========================================================
   학력
========================================================= */

function normalizeEducation(value) {
  const text = cleanValue(value);

  if (!text) return "";

  const upper = text.toUpperCase();

  if (
    upper.includes(
      "EDUCATION_NOT_REQUIRED"
    )
  ) {
    return "학력무관";
  }

  if (upper.includes("BACHELOR")) {
    return "대졸";
  }

  if (upper.includes("ASSOCIATE")) {
    return "전문대졸";
  }

  if (upper.includes("HIGH_SCHOOL")) {
    return "고졸";
  }

  return text;
}


/* =========================================================
   지역
========================================================= */

function shortLocation(location) {
  const value = cleanValue(location);

  if (!value) return "";

  const tokens =
    value
      .split(/\s+/)
      .filter(Boolean);

  if (!tokens.length) return "";

  if (tokens.length >= 2) {
    return `${tokens[0]} ${tokens[1]}`;
  }

  return tokens[0];
}


/* =========================================================
   마감
========================================================= */

function normalizeDeadline(value) {
  const text = cleanValue(value);

  if (!text) return "";

  if (/상시/i.test(text)) {
    return "상시채용";
  }

  if (/채용시/i.test(text)) {
    return "채용시";
  }

  let match = text.match(
    /\d{4}[-./](\d{1,2})[-./](\d{1,2})/
  );

  if (match) {
    return (
      `${match[1].padStart(2, "0")}.` +
      `${match[2].padStart(2, "0")}`
    );
  }

  match = text.match(
    /(\d{1,2})[./](\d{1,2})/
  );

  if (match) {
    return (
      `${match[1].padStart(2, "0")}.` +
      `${match[2].padStart(2, "0")}`
    );
  }

  return text;
}


/* =========================================================
   검색
========================================================= */

async function runSearch() {
  const keyword =
    $("keyword")?.value.trim() ||
    "보건관리자";

  lastSearchKeyword = keyword;

  if ($("status")) {
    $("status").textContent =
      "사람인 · 잡코리아 · 인크루트에서 검색 중...";
  }

  if ($("searchBtn")) {
    $("searchBtn").disabled = true;
  }

  if ($("resultList")) {
    $("resultList").innerHTML = "";
  }

  try {
    const response = await fetch(
      `/api/search?keyword=${encodeURIComponent(
        keyword
      )}`,
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    currentJobs =
      (data.jobs || []).map(
        (job) => ({
          ...job,

          /*
           * ★ 중요
           * API 결과에 검색 키워드를 붙여둔다.
           */
          searchKeyword: keyword,

          company:
            cleanValue(job.company),

          location:
            cleanValue(job.location),

          employment:
            normalizeEmployment(
              job.employment
            ),

          experience:
            normalizeExperience(
              job.experience
            ),

          education:
            normalizeEducation(
              job.education
            ),

          deadline:
            normalizeDeadline(
              job.deadline
            ),
        })
      );

    renderResults(currentJobs);

    const bySource = {};

    currentJobs.forEach((job) => {
      bySource[job.source] =
        (bySource[job.source] || 0) + 1;
    });

    const summary =
      Object.entries(bySource)
        .map(
          ([source, count]) =>
            `${source} ${count}건`
        )
        .join(" · ");

    const failedSources =
      Object.keys(
        data.errors || {}
      );

    let status =
      currentJobs.length
        ? `총 ${currentJobs.length}건`
        : "검색 결과가 없습니다.";

    if (summary) {
      status += ` (${summary})`;
    }

    if (failedSources.length) {
      status +=
        ` · 일부 검색 실패: ${failedSources.join(
          ", "
        )}`;
    }

    if ($("status")) {
      $("status").textContent =
        status;
    }
  } catch (error) {
    if ($("status")) {
      $("status").textContent =
        `검색 중 오류가 발생했습니다: ${error.message}`;
    }
  } finally {
    if ($("searchBtn")) {
      $("searchBtn").disabled = false;
    }
  }
}


/* =========================================================
   검색 결과
========================================================= */

function renderResults(jobs) {
  const list = $("resultList");

  if (!list) return;

  list.innerHTML = "";

  jobs.forEach(
    (job, index) => {
      const item =
        document.createElement("li");

      item.className =
        "result-item";

      const company =
        companyName(job) ||
        "회사명 확인";

      const meta = [
        shortLocation(
          job.location
        ),

        guessEmploymentType(job),

        normalizeExperience(
          job.experience
        ),

        normalizeDeadline(
          job.deadline
        ),
      ]
        .filter(Boolean)
        .join(" · ");

      item.innerHTML = `
        <span class="src-tag">
          ${escapeHtml(job.source)}
        </span>

        <p class="company">
          ${escapeHtml(company)}
        </p>

        <p class="title">
          ${escapeHtml(
            normalizeTitle(job.title)
          )}
        </p>

        ${
          meta
            ? `
            <p class="result-meta">
              ${escapeHtml(meta)}
            </p>
          `
            : ""
        }
      `;

      item.addEventListener(
        "click",
        () => openSheet(index)
      );

      list.appendChild(item);
    }
  );
}


/* =========================================================
   상세 API
========================================================= */

async function fetchDetail(job) {
  if (!job?.url) return job;

  if (job.detailLoaded) {
    return job;
  }

  const endpoint =
    "/api/detail" +
    `?source=${encodeURIComponent(
      job.source || ""
    )}` +
    `&url=${encodeURIComponent(
      job.url
    )}`;

  const response =
    await fetch(endpoint, {
      cache: "no-store",
    });

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.ok
  ) {
    throw new Error(
      data.error ||
        `상세정보 HTTP ${response.status}`
    );
  }

  const detail =
    data.detail || {};

  return {
    ...job,

    /*
     * ★ 검색 키워드는 상세페이지 병합 후에도 유지
     */
    searchKeyword:
      job.searchKeyword ||
      lastSearchKeyword,

    company:
      firstValue(
        detail.company,
        job.company,
        inferCompanyFromTitle(
          job.title
        )
      ),

    title:
      firstValue(
        normalizeTitle(
          detail.title
        ),
        normalizeTitle(
          job.title
        )
      ),

    jobTitle:
      firstValue(
        detail.jobTitle,
        job.jobTitle
      ),

    location:
      firstValue(
        detail.location,
        job.location
      ),

    employment:
      normalizeEmployment(
        firstValue(
          detail.employment,
          job.employment
        )
      ),

    experience:
      normalizeExperience(
        firstValue(
          detail.experience,
          job.experience
        )
      ),

    education:
      normalizeEducation(
        firstValue(
          detail.education,
          job.education
        )
      ),

    deadline:
      normalizeDeadline(
        firstValue(
          detail.deadline,
          job.deadline
        )
      ),

    duties:
      firstValue(
        detail.duties,
        job.duties
      ),

    requirements:
      firstValue(
        detail.requirements,
        job.requirements
      ),

    preferences:
      firstValue(
        detail.preferences,
        job.preferences
      ),

    workConditions:
      firstValue(
        detail.workConditions,
        job.workConditions
      ),

    detailLoaded: true,
  };
}


async function ensureSelectedDetail() {
  if (!selectedJob) return null;

  if (selectedJob.detailLoaded) {
    return selectedJob;
  }

  if (detailLoading) {
    return detailLoading;
  }

  detailLoading = (async () => {
    try {
      const enriched =
        await fetchDetail(
          selectedJob
        );

      selectedJob =
        enriched;

      const index =
        currentJobs.findIndex(
          (job) =>
            job.url ===
            enriched.url
        );

      if (index >= 0) {
        currentJobs[index] =
          enriched;
      }

      updateSheet();

      return enriched;
    } finally {
      detailLoading = null;
    }
  })();

  return detailLoading;
}


/* =========================================================
   상세 시트
========================================================= */

async function openSheet(index) {
  selectedJob =
    currentJobs[index];

  updateSheet(true);

  $("sheetBackdrop")
    ?.classList.remove(
      "hidden"
    );

  try {
    await ensureSelectedDetail();
  } catch {
    updateSheet(false);

    showToast(
      "상세정보 일부를 가져오지 못했어요."
    );
  }
}


function updateSheet(
  loading = false
) {
  if (!selectedJob) return;

  if ($("sheetTitle")) {
    $("sheetTitle").textContent =
      normalizeTitle(
        selectedJob.title
      ) ||
      "채용공고";
  }

  if ($("sheetMeta")) {
    if (loading) {
      $("sheetMeta").textContent =
        "상세 채용정보를 불러오는 중...";

      return;
    }

    const meta = [
      companyName(
        selectedJob
      ),

      guessJobLabel(
        selectedJob
      ),

      shortLocation(
        selectedJob.location
      ),

      guessEmploymentType(
        selectedJob
      ),

      normalizeExperience(
        selectedJob.experience
      ),

      normalizeDeadline(
        selectedJob.deadline
      )
        ? `마감 ${normalizeDeadline(
            selectedJob.deadline
          )}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");

    $("sheetMeta").textContent =
      meta ||
      "상세정보는 원문에서 확인해주세요.";
  }

  fillDetailEditForm(
    selectedJob
  );
}


function closeSheet() {
  $("sheetBackdrop")
    ?.classList.add(
      "hidden"
    );
}


/* =========================================================
   수정 폼
========================================================= */

function setOptionalInput(
  id,
  value
) {
  const el = $(id);

  if (!el) return;

  el.value =
    cleanValue(value);
}


function fillDetailEditForm(job) {
  if (!job) return;

  setOptionalInput(
    "d_company",
    companyName(job)
  );

  setOptionalInput(
    "d_jobTitle",
    guessJobLabel(job)
  );

  setOptionalInput(
    "d_location",
    job.location
  );

  setOptionalInput(
    "d_employment",
    guessEmploymentType(job)
  );

  setOptionalInput(
    "d_experience",
    normalizeExperience(
      job.experience
    )
  );

  setOptionalInput(
    "d_education",
    normalizeEducation(
      job.education
    )
  );

  setOptionalInput(
    "d_deadline",
    normalizeDeadline(
      job.deadline
    )
  );

  setOptionalInput(
    "d_duties",
    job.duties
  );

  setOptionalInput(
    "d_requirements",
    job.requirements
  );

  setOptionalInput(
    "d_preferences",
    job.preferences
  );

  setOptionalInput(
    "d_workConditions",
    job.workConditions
  );
}


function applyDetailEditForm() {
  if (!selectedJob) return;

  const value = (
    id,
    fallback
  ) =>
    cleanValue(
      $(id)?.value
    ) ||
    fallback ||
    "";

  selectedJob = {
    ...selectedJob,

    company:
      value(
        "d_company",
        selectedJob.company
      ),

    /*
     * 사용자가 직접 대표 직무명을 수정하면
     * 이후에는 검색키워드보다 이것을 우선하기 위해
     * manualJobTitle 저장
     */
    manualJobTitle:
      value(
        "d_jobTitle",
        selectedJob.manualJobTitle
      ),

    location:
      value(
        "d_location",
        selectedJob.location
      ),

    employment:
      normalizeEmployment(
        value(
          "d_employment",
          selectedJob.employment
        )
      ),

    experience:
      normalizeExperience(
        value(
          "d_experience",
          selectedJob.experience
        )
      ),

    education:
      normalizeEducation(
        value(
          "d_education",
          selectedJob.education
        )
      ),

    deadline:
      normalizeDeadline(
        value(
          "d_deadline",
          selectedJob.deadline
        )
      ),

    duties:
      value(
        "d_duties",
        selectedJob.duties
      ),

    requirements:
      value(
        "d_requirements",
        selectedJob.requirements
      ),

    preferences:
      value(
        "d_preferences",
        selectedJob.preferences
      ),

    workConditions:
      value(
        "d_workConditions",
        selectedJob.workConditions
      ),
  };

  /*
   * 직접 입력값이 있으면 대표 직무명에 사용
   */
  if (selectedJob.manualJobTitle) {
    selectedJob.jobTitle =
      selectedJob.manualJobTitle;

    selectedJob.searchKeyword = "";
  }

  const index =
    currentJobs.findIndex(
      (job) =>
        job.url ===
        selectedJob.url
    );

  if (index >= 0) {
    currentJobs[index] =
      selectedJob;
  }

  updateSheet();

  showToast(
    "수정 내용을 반영했어요."
  );
}


/* =========================================================
   초안 섹션
========================================================= */

function sectionLines(value) {
  const text =
    cleanValue(value);

  if (!text) return [];

  return text
    .split(/\n+/)
    .map((line) =>
      line
        .replace(
          /^[•·ㆍ\-–—※＊*▶▷▪■□○●]+\s*/,
          ""
        )
        .trim()
    )
    .filter(Boolean)
    .filter(
      (item, index, arr) =>
        arr.indexOf(item) ===
        index
    )
    .slice(0, 8);
}


function makeBulletSection(
  title,
  value
) {
  const lines =
    sectionLines(value);

  if (!lines.length) {
    return "";
  }

  return [
    `| ${title}`,
    "",
    ...lines.map(
      (line) =>
        `- ${line}`
    ),
    "",
  ].join("\n");
}


/* =========================================================
   블로그 제목
========================================================= */

function buildBlogTitle(job) {
  const company =
    companyName(job) ||
    "채용기업";

  const jobLabel =
    guessJobLabel(job);

  const extras = [
    shortLocation(
      job.location
    ),
    guessEmploymentType(
      job
    ),
  ].filter(Boolean);

  let title =
    `${company} ${jobLabel} 채용`;

  if (extras.length) {
    title +=
      ` | ${extras.join(" · ")}`;
  }

  return title;
}


/* =========================================================
   해시태그
========================================================= */

function buildHashtags(job) {
  const tags = [];

  function add(value) {
    const tag =
      String(value || "")
        .replace(
          /[^가-힣a-zA-Z0-9]/g,
          ""
        )
        .trim();

    if (
      tag &&
      !tags.includes(tag)
    ) {
      tags.push(tag);
    }
  }

  const jobLabel =
    guessJobLabel(job);

  const company =
    companyName(job);

  const location =
    shortLocation(
      job.location
    );

  add(jobLabel);
  add(`${jobLabel}채용`);
  add("채용정보");

  if (
    jobLabel.includes("보건") ||
    jobLabel.includes("간호")
  ) {
    add("산업보건");
    add("산업간호사");
  }

  if (
    jobLabel.includes("안전")
  ) {
    add("산업안전");
  }

  add(company);

  if (location) {
    add(`${location}채용`);
  }

  add(job.source);

  return tags
    .slice(0, 10)
    .map(
      (tag) => `#${tag}`
    )
    .join(" ");
}


/* =========================================================
   블로그 초안
========================================================= */

function buildDraft(job) {
  const company =
    companyName(job) ||
    "채용기업";

  const jobLabel =
    guessJobLabel(job);

  const location =
    cleanValue(
      job.location
    );

  const employment =
    guessEmploymentType(job);

  const experience =
    normalizeExperience(
      job.experience
    );

  const education =
    normalizeEducation(
      job.education
    );

  const deadline =
    normalizeDeadline(
      job.deadline
    );

  const summaryItems = [
    ["회사명", company],
    ["모집 직무", jobLabel],
    [
      "공고명",
      normalizeTitle(job.title),
    ],
    ["근무 지역", location],
    ["고용 형태", employment],
    ["경력", experience],
    ["학력", education],
    ["접수 마감", deadline],
    ["공고 출처", job.source],
  ];

  const summary =
    summaryItems
      .filter(
        ([, value]) => value
      )
      .map(
        ([label, value]) =>
          `- ${label}: ${value}`
      )
      .join("\n");

  const locationShort =
    shortLocation(location);

  const intro =
    locationShort
      ? `${locationShort} 지역에서 ${jobLabel} 채용을 찾고 계셨다면 확인해보셔도 좋을 것 같습니다.`
      : `${jobLabel} 채용을 찾고 계셨다면 확인해보셔도 좋을 것 같습니다.`;

  const sections = [
    makeBulletSection(
      "주요 업무",
      job.duties
    ),

    makeBulletSection(
      "지원자격",
      job.requirements
    ),

    makeBulletSection(
      "우대사항",
      job.preferences
    ),

    makeBulletSection(
      "근무조건",
      job.workConditions
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const fallback =
    sections
      ? ""
      : `| 지원 전 확인사항

- 세부 업무와 지원자격, 우대사항은 공고 원문에서 확인해주세요.

`;

  return `[제목]
${buildBlogTitle(job)}

[본문]
[여기에 대표 썸네일 이미지를 삽입하세요]

안녕하세요. 고덕이네입니다.

오늘 공유드릴 채용공고는
${company} ${jobLabel} 채용입니다.

${intro}

| 채용 요약

${summary}

${sections}${fallback}| 지원 전 체크

- 지원 전 실제 모집요강과 자격요건을 공고 원문에서 최종 확인해주세요.
${
  deadline
    ? `- 현재 확인된 접수 마감 정보는 ${deadline}입니다.`
    : "- 접수 마감일은 공고 원문에서 확인해주세요."
}

공고 원문
${job.url || ""}

${buildHashtags(job)}
`;
}


/* =========================================================
   Canvas
========================================================= */

const CANVAS_SIZE = 1080;

const COLORS = {
  navy: "#102a5c",
  blue: "#2563eb",
  vividBlue: "#215ae2",
  lightLine: "#d6dff0",
  cardBg: "#f7fafe",
  white: "#ffffff",
  gray: "#6e7684",
  paleBlue: "#e7efff",
};


function roundRectPath(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  const r = Math.min(
    radius,
    width / 2,
    height / 2
  );

  ctx.beginPath();

  ctx.moveTo(
    x + r,
    y
  );

  ctx.arcTo(
    x + width,
    y,
    x + width,
    y + height,
    r
  );

  ctx.arcTo(
    x + width,
    y + height,
    x,
    y + height,
    r
  );

  ctx.arcTo(
    x,
    y + height,
    x,
    y,
    r
  );

  ctx.arcTo(
    x,
    y,
    x + width,
    y,
    r
  );

  ctx.closePath();
}


function canvasFont(
  weight,
  size
) {
  return (
    `${weight} ${size}px ` +
    `Pretendard, "Noto Sans KR", Arial, sans-serif`
  );
}


function fitFontSize(
  ctx,
  text,
  weight,
  maxWidth,
  startSize,
  minSize
) {
  let size = startSize;

  ctx.font =
    canvasFont(
      weight,
      size
    );

  while (
    size > minSize &&
    ctx.measureText(text).width >
      maxWidth
  ) {
    size -= 2;

    ctx.font =
      canvasFont(
        weight,
        size
      );
  }

  return size;
}


/* =========================================================
   카드 아이콘
========================================================= */

function drawIconLocation(
  ctx,
  cx,
  cy,
  size,
  color
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;

  ctx.beginPath();

  ctx.arc(
    cx,
    cy - 5,
    size * 0.52,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.arc(
    cx,
    cy - 5,
    size * 0.15,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.beginPath();

  ctx.moveTo(
    cx - size * 0.34,
    cy + size * 0.24
  );

  ctx.lineTo(
    cx,
    cy + size * 0.88
  );

  ctx.lineTo(
    cx + size * 0.34,
    cy + size * 0.24
  );

  ctx.stroke();
}


function drawIconDoc(
  ctx,
  cx,
  cy,
  size,
  color
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;

  const width =
    size * 1.05;

  const height =
    size * 1.35;

  ctx.strokeRect(
    cx - width / 2,
    cy - height / 2,
    width,
    height
  );

  for (
    let i = 0;
    i < 3;
    i++
  ) {
    const y =
      cy -
      height * 0.2 +
      i * size * 0.3;

    ctx.beginPath();

    ctx.moveTo(
      cx - width * 0.28,
      y
    );

    ctx.lineTo(
      cx + width * 0.28,
      y
    );

    ctx.stroke();
  }
}


function drawIconPerson(
  ctx,
  cx,
  cy,
  size,
  color
) {
  ctx.fillStyle = color;

  ctx.beginPath();

  ctx.arc(
    cx,
    cy - size * 0.28,
    size * 0.25,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.beginPath();

  ctx.arc(
    cx,
    cy + size * 0.38,
    size * 0.5,
    Math.PI,
    0
  );

  ctx.fill();
}


function drawIconCalendar(
  ctx,
  cx,
  cy,
  size,
  color
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;

  roundRectPath(
    ctx,
    cx - size,
    cy - size * 0.72,
    size * 2,
    size * 1.55,
    6
  );

  ctx.stroke();

  ctx.beginPath();

  ctx.moveTo(
    cx - size,
    cy - size * 0.25
  );

  ctx.lineTo(
    cx + size,
    cy - size * 0.25
  );

  ctx.stroke();

  [-0.45, 0.45].forEach(
    (offset) => {
      ctx.beginPath();

      ctx.moveTo(
        cx + size * offset,
        cy - size
      );

      ctx.lineTo(
        cx + size * offset,
        cy - size * 0.55
      );

      ctx.stroke();
    }
  );

  for (
    let row = 0;
    row < 2;
    row++
  ) {
    for (
      let col = 0;
      col < 3;
      col++
    ) {
      ctx.beginPath();

      ctx.arc(
        cx -
          size * 0.48 +
          col * size * 0.48,

        cy +
          size * 0.08 +
          row * size * 0.35,

        size * 0.07,

        0,
        Math.PI * 2
      );

      ctx.fill();
    }
  }
}


const ICONS = {
  location:
    drawIconLocation,

  doc:
    drawIconDoc,

  person:
    drawIconPerson,

  calendar:
    drawIconCalendar,
};


/* =========================================================
   ★ 토끼 PNG

   fallback Canvas 토끼 완전 삭제.
========================================================= */

let mascotImg = null;
let mascotChecked = false;


function getMascotImage() {
  if (mascotChecked) {
    return Promise.resolve(
      mascotImg
    );
  }

  return new Promise(
    (resolve) => {
      const image =
        new Image();

      image.onload = () => {
        mascotImg = image;
        mascotChecked = true;

        resolve(image);
      };

      image.onerror = () => {
        /*
         * 파일 못 찾으면
         * 이상한 토끼를 새로 그리지 않는다.
         */
        mascotImg = null;
        mascotChecked = true;

        resolve(null);
      };

      image.src =
        "/icons/mascot-rabbit.png?v=5";
    }
  );
}


/* =========================================================
   썸네일 부제
========================================================= */

function buildThumbnailSubtitle(job) {
  const label =
    guessJobLabel(job);

  const title =
    normalizeTitle(
      job?.title
    );

  /*
   * 대한조선 같은 통합채용 제목
   */
  if (
    !title ||
    isGenericRecruitmentTitle(title)
  ) {
    return `${label} 모집`;
  }

  let cleaned = title;

  const company =
    companyName(job);

  if (company) {
    cleaned = cleaned
      .replace(
        new RegExp(
          `^\\[?${escapeRegExp(
            company
          )}\\]?\\s*`,
          "i"
        ),
        ""
      )
      .trim();
  }

  /*
   * 보건관리자로 검색했는데
   * 제목에 직무가 전혀 없고 그냥 공채성 제목이면
   * 대표 직무를 사용.
   */
  if (
    normalizeSearchKeyword(
      job?.searchKeyword
    ) &&
    !findRepresentativeJobLabel(
      cleaned
    )
  ) {
    return `${label} 모집`;
  }

  if (cleaned.length > 24) {
    cleaned =
      `${cleaned.slice(0, 24)}…`;
  }

  return (
    cleaned ||
    `${label} 모집`
  );
}


/* =========================================================
   썸네일 열기
========================================================= */

function openThumbSheet() {
  if (!selectedJob) return;

  const job =
    selectedJob;

  const company =
    companyName(job) ||
    "채용기업";

  const label =
    guessJobLabel(job);

  const subtitle =
    buildThumbnailSubtitle(job);

  if ($("f_company")) {
    $("f_company").value =
      company;
  }

  if ($("f_jobLabel")) {
    $("f_jobLabel").value =
      label;
  }

  if ($("f_sub1")) {
    $("f_sub1").value =
      subtitle;
  }

  if ($("f_sub2")) {
    $("f_sub2").value = "";
  }

  if ($("f_location")) {
    $("f_location").value =
      shortLocation(
        job.location
      );
  }

  if ($("f_employment")) {
    $("f_employment").value =
      guessEmploymentType(job);
  }

  if ($("f_experience")) {
    $("f_experience").value =
      normalizeExperience(
        job.experience
      );
  }

  if ($("f_deadline")) {
    $("f_deadline").value =
      normalizeDeadline(
        job.deadline
      );
  }

  if ($("f_useMascot")) {
    $("f_useMascot").checked =
      true;
  }

  closeSheet();

  $("thumbBackdrop")
    ?.classList.remove(
      "hidden"
    );

  drawThumbnail();
}


/* =========================================================
   썸네일 생성
========================================================= */

async function drawThumbnail() {
  const canvas =
    $("thumbCanvas");

  if (!canvas) return;

  const ctx =
    canvas.getContext("2d");

  const company =
    cleanValue(
      $("f_company")?.value
    ) ||
    "채용기업";

  const jobLabel =
    cleanValue(
      $("f_jobLabel")?.value
    ) ||
    "채용";

  const sub1 =
    cleanValue(
      $("f_sub1")?.value
    );

  const sub2 =
    cleanValue(
      $("f_sub2")?.value
    );

  const location =
    cleanValue(
      $("f_location")?.value
    );

  const employment =
    normalizeEmployment(
      $("f_employment")?.value
    );

  const experience =
    normalizeExperience(
      $("f_experience")?.value
    );

  const deadline =
    normalizeDeadline(
      $("f_deadline")?.value
    );

  const useMascot =
    $("f_useMascot")
      ? $("f_useMascot").checked
      : true;


  /* 배경 */

  ctx.clearRect(
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE
  );

  ctx.fillStyle =
    COLORS.white;

  ctx.fillRect(
    0,
    0,
    CANVAS_SIZE,
    CANVAS_SIZE
  );


  /* 테두리 */

  ctx.strokeStyle =
    COLORS.vividBlue;

  ctx.lineWidth = 8;

  roundRectPath(
    ctx,
    24,
    24,
    CANVAS_SIZE - 48,
    CANVAS_SIZE - 48,
    46
  );

  ctx.stroke();


  const pad = 70;


  /* 상단 라벨 */

  const labelText =
    jobLabel.endsWith(
      "채용"
    )
      ? jobLabel
      : `${jobLabel} 채용`;

  const labelFontSize =
    fitFontSize(
      ctx,
      labelText,
      700,
      410,
      40,
      27
    );

  ctx.font =
    canvasFont(
      700,
      labelFontSize
    );

  const labelWidth =
    Math.min(
      450,
      ctx.measureText(
        labelText
      ).width + 68
    );

  const labelHeight = 82;

  ctx.fillStyle =
    COLORS.vividBlue;

  roundRectPath(
    ctx,
    pad,
    82,
    labelWidth,
    labelHeight,
    41
  );

  ctx.fill();

  ctx.fillStyle =
    COLORS.white;

  ctx.font =
    canvasFont(
      700,
      labelFontSize
    );

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    labelText,
    pad + 34,
    123
  );


  /* =====================================================
     ★ 네 토끼 PNG
  ===================================================== */

  if (useMascot) {
    const image =
      await getMascotImage();

    /*
     * PNG가 있을 때만 그림.
     * 없으면 아무것도 안 그림.
     */
    if (image) {
      const boxSize = 168;

      const ratio =
        Math.min(
          boxSize /
            image.width,
          boxSize /
            image.height
        );

      const width =
        image.width * ratio;

      const height =
        image.height * ratio;

      const x =
        CANVAS_SIZE -
        pad -
        width;

      const y =
        52 +
        (boxSize - height) /
          2;

      ctx.drawImage(
        image,
        x,
        y,
        width,
        height
      );
    }
  }


  /* 회사명 */

  const companyMaxWidth =
    CANVAS_SIZE -
    pad * 2;

  const companySize =
    fitFontSize(
      ctx,
      company,
      800,
      companyMaxWidth,
      96,
      50
    );

  ctx.font =
    canvasFont(
      800,
      companySize
    );

  ctx.fillStyle =
    COLORS.navy;

  ctx.textBaseline =
    "alphabetic";

  ctx.fillText(
    company,
    pad,
    300
  );


  /* 구분선 */

  const dividerY = 354;

  ctx.strokeStyle =
    COLORS.lightLine;

  ctx.lineWidth = 3;

  ctx.beginPath();

  ctx.moveTo(
    pad,
    dividerY
  );

  ctx.lineTo(
    CANVAS_SIZE - pad,
    dividerY
  );

  ctx.stroke();


  /* 직무/부제 */

  const subtitles =
    [sub1, sub2]
      .filter(Boolean)
      .filter(
        (value, index, arr) =>
          arr.indexOf(value) ===
          index
      );

  let subtitleY = 442;

  ctx.fillStyle =
    COLORS.blue;

  subtitles
    .slice(0, 2)
    .forEach((text) => {
      const size =
        fitFontSize(
          ctx,
          text,
          700,
          CANVAS_SIZE -
            pad * 2,
          53,
          31
        );

      ctx.font =
        canvasFont(
          700,
          size
        );

      ctx.fillText(
        text,
        pad,
        subtitleY
      );

      subtitleY +=
        size + 30;
    });


  /* =====================================================
     카드
  ===================================================== */

  const cards = [
    {
      icon: "location",
      value: location,
      caption: "근무지",
    },

    {
      icon: "doc",
      value: employment,
      caption: "고용형태",
    },

    {
      icon: "person",
      value: experience,
      caption: "경력/자격",
    },

    {
      icon: "calendar",
      value: deadline,
      caption: "접수마감",
    },
  ].filter(
    (card) =>
      cleanValue(card.value)
  );


  const cardTop = 700;
  const cardHeight = 240;
  const gap = 16;

  if (cards.length) {
    const availableWidth =
      CANVAS_SIZE -
      pad * 2;

    let cardWidth;

    if (cards.length === 1) {
      cardWidth = 330;
    } else {
      cardWidth =
        (
          availableWidth -
          gap *
            (cards.length - 1)
        ) /
        cards.length;
    }

    let currentX =
      cards.length === 1
        ? (
            CANVAS_SIZE -
            cardWidth
          ) /
          2
        : pad;


    for (const card of cards) {
      ctx.fillStyle =
        COLORS.cardBg;

      ctx.strokeStyle =
        COLORS.lightLine;

      ctx.lineWidth = 2;

      roundRectPath(
        ctx,
        currentX,
        cardTop,
        cardWidth,
        cardHeight,
        22
      );

      ctx.fill();
      ctx.stroke();


      const centerX =
        currentX +
        cardWidth / 2;

      const iconY =
        cardTop + 65;


      ctx.fillStyle =
        COLORS.paleBlue;

      ctx.beginPath();

      ctx.arc(
        centerX,
        iconY,
        45,
        0,
        Math.PI * 2
      );

      ctx.fill();


      ICONS[card.icon](
        ctx,
        centerX,
        iconY,
        25,
        COLORS.vividBlue
      );


      const valueFontSize =
        fitFontSize(
          ctx,
          card.value,
          700,
          cardWidth - 22,
          34,
          18
        );

      ctx.font =
        canvasFont(
          700,
          valueFontSize
        );

      ctx.fillStyle =
        COLORS.navy;

      ctx.textAlign =
        "center";

      ctx.textBaseline =
        "alphabetic";

      ctx.fillText(
        card.value,
        centerX,
        cardTop + 157
      );


      ctx.font =
        canvasFont(
          400,
          23
        );

      ctx.fillStyle =
        COLORS.gray;

      ctx.fillText(
        card.caption,
        centerX,
        cardTop + 201
      );

      ctx.textAlign =
        "left";

      currentX +=
        cardWidth + gap;
    }
  }


  /* 고덕이네 */

  ctx.font =
    canvasFont(
      700,
      30
    );

  ctx.fillStyle =
    COLORS.navy;

  ctx.textAlign =
    "right";

  ctx.fillText(
    "고덕이네",
    CANVAS_SIZE - pad,
    1010
  );

  ctx.textAlign =
    "left";
}


/* =========================================================
   이벤트
========================================================= */

$("searchBtn")
  ?.addEventListener(
    "click",
    runSearch
  );


$("keyword")
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key ===
        "Enter"
      ) {
        runSearch();
      }
    }
  );


$("sheetCloseBtn")
  ?.addEventListener(
    "click",
    closeSheet
  );


$("sheetBackdrop")
  ?.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        $("sheetBackdrop")
      ) {
        closeSheet();
      }
    }
  );


$("openOriginalBtn")
  ?.addEventListener(
    "click",
    () => {
      if (
        selectedJob?.url
      ) {
        window.open(
          selectedJob.url,
          "_blank"
        );
      }
    }
  );


$("reloadDetailBtn")
  ?.addEventListener(
    "click",
    async () => {
      if (!selectedJob) return;

      selectedJob.detailLoaded =
        false;

      if ($("sheetMeta")) {
        $("sheetMeta").textContent =
          "상세정보를 다시 불러오는 중...";
      }

      try {
        await ensureSelectedDetail();

        showToast(
          "상세정보를 다시 불러왔어요."
        );
      } catch {
        showToast(
          "상세정보를 불러오지 못했어요."
        );
      }
    }
  );


$("saveDetailBtn")
  ?.addEventListener(
    "click",
    applyDetailEditForm
  );


/* 블로그 초안 */

$("draftBtn")
  ?.addEventListener(
    "click",
    async () => {
      if (!selectedJob) return;

      try {
        await ensureSelectedDetail();
      } catch {
        /* 현재 데이터 사용 */
      }

      if ($("draftText")) {
        $("draftText").value =
          buildDraft(
            selectedJob
          );
      }

      closeSheet();

      $("draftBackdrop")
        ?.classList.remove(
          "hidden"
        );
    }
  );


$("draftCloseBtn")
  ?.addEventListener(
    "click",
    () => {
      $("draftBackdrop")
        ?.classList.add(
          "hidden"
        );
    }
  );


$("draftBackdrop")
  ?.addEventListener(
    "click",
    (event) => {
      if (
        event.target ===
        $("draftBackdrop")
      ) {
        $("draftBackdrop")
          ?.classList.add(
            "hidden"
          );
      }
    }
  );


$("copyDraftBtn")
  ?.addEventListener(
    "click",
    async () => {
      const text =
        $("draftText")?.value ||
        "";

      try {
        await navigator.clipboard
          .writeText(text);

        showToast(
          "클립보드에 복사했어요."
        );
      } catch {
        if ($("draftText")) {
          $("draftText")
            .select();

          document.execCommand(
            "copy"
          );

          showToast(
            "클립보드에 복사했어요."
          );
        }
      }
    }
  );


/* 썸네일 */

$("thumbBtn")
  ?.addEventListener(
    "click",
    async () => {
      if (!selectedJob) return;

      try {
        await ensureSelectedDetail();
      } catch {
        /* 현재 데이터 사용 */
      }

      openThumbSheet();
    }
  );


$("thumbCloseBtn")
  ?.addEventListener(
    "click",
    () => {
      $("thumbBackdrop")
        ?.classList.add(
          "hidden"
        );
    }
  );


$("regenThumbBtn")
  ?.addEventListener(
    "click",
    drawThumbnail
  );


[
  "f_company",
  "f_jobLabel",
  "f_sub1",
  "f_sub2",
  "f_location",
  "f_employment",
  "f_experience",
  "f_deadline",
  "f_useMascot",
].forEach((id) => {
  const element = $(id);

  if (!element) return;

  element.addEventListener(
    "input",
    drawThumbnail
  );

  element.addEventListener(
    "change",
    drawThumbnail
  );
});


/* PNG 저장 */

$("downloadThumbBtn")
  ?.addEventListener(
    "click",
    () => {
      const canvas =
        $("thumbCanvas");

      if (!canvas) return;

      canvas.toBlob(
        (blob) => {
          if (!blob) return;

          const url =
            URL.createObjectURL(
              blob
            );

          const link =
            document.createElement(
              "a"
            );

          const fileName =
            (
              $("f_company")
                ?.value ||
              "thumbnail"
            ).replace(
              /[^\w가-힣()]/g,
              "_"
            );

          link.href = url;

          link.download =
            `썸네일_${fileName}.png`;

          document.body
            .appendChild(
              link
            );

          link.click();
          link.remove();

          URL.revokeObjectURL(
            url
          );

          showToast(
            "썸네일을 저장했어요."
          );
        },
        "image/png"
      );
    }
  );


/* =========================================================
   서비스워커
========================================================= */

if (
  "serviceWorker" in navigator
) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    }
  );
}
