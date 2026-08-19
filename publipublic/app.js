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
   문자열 처리
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

  const badValues = [
    "원문 확인",
    "회사명 확인",
    "회사명 원문 확인",
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

  if (
    badValues.some(
      (item) =>
        text.toLowerCase() ===
        item.toLowerCase()
    )
  ) {
    return "";
  }

  return text;
}


function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanValue(value);

    if (cleaned) {
      return cleaned;
    }
  }

  return "";
}


function normalizeTitle(title) {
  return cleanValue(title)
    .replace(
      /\s*[-|]\s*(사람인|잡코리아|인크루트).*$/i,
      ""
    )
    .replace(/\s*::\s*.*$/i, "")
    .trim();
}


function inferCompanyFromTitle(title) {
  const match =
    normalizeTitle(title).match(
      /^\[([^\]]{2,60})\]/
    );

  return match
    ? match[1].trim()
    : "";
}


function companyName(job) {
  return firstValue(
    job?.company,
    inferCompanyFromTitle(
      job?.title
    )
  );
}


/* =========================================================
   직무 판별
========================================================= */

function normalizeSearchKeyword(keyword) {
  const value =
    String(keyword || "");

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


function findRepresentativeJobLabel(text) {
  const value =
    String(text || "");

  const rules = [
    [/안전보건관리자/i, "안전보건관리자"],
    [/보건관리자/i, "보건관리자"],
    [/산업간호사/i, "산업간호사"],
    [/안전관리자/i, "안전관리자"],
    [/산업위생관리자/i, "산업위생관리자"],
    [/산업위생/i, "산업위생"],
    [/간호사/i, "간호사"],
  ];

  for (const [regex, label] of rules) {
    if (regex.test(value)) {
      return label;
    }
  }

  return "";
}


function guessJobLabel(job) {
  const manual =
    cleanValue(
      job?.manualJobTitle
    );

  if (manual) {
    return manual;
  }

  const searched =
    normalizeSearchKeyword(
      job?.searchKeyword
    );

  if (searched) {
    return searched;
  }

  const detail =
    findRepresentativeJobLabel(
      job?.jobTitle
    );

  if (detail) {
    return detail;
  }

  const title =
    findRepresentativeJobLabel(
      job?.title
    );

  if (title) {
    return title;
  }

  return "채용";
}


/* =========================================================
   고용형태
========================================================= */

function normalizeEmployment(value) {
  const original =
    cleanValue(value);

  if (!original) return "";

  const upper =
    original.toUpperCase();

  if (
    upper.includes("FULL_TIME") ||
    upper.includes("FULLTIME") ||
    upper.includes("PERMANENT") ||
    upper.includes("REGULAR")
  ) {
    return "정규직";
  }

  if (
    upper.includes("CONTRACTOR") ||
    upper.includes("CONTRACT") ||
    upper.includes("FIXED_TERM")
  ) {
    return "계약직";
  }

  if (
    upper.includes("PART_TIME")
  ) {
    return "시간제";
  }

  if (
    upper.includes("INTERN")
  ) {
    return "인턴";
  }

  return original;
}


function guessEmploymentType(job) {
  const direct =
    normalizeEmployment(
      job?.employment
    );

  if (direct) {
    return direct;
  }

  const text = [
    job?.title,
    job?.workConditions,
  ]
    .filter(Boolean)
    .join(" ");

  const types = [
    "육아휴직 대체 계약직",
    "휴직대체 계약직",
    "정규직",
    "계약직",
    "인턴",
    "파견직",
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
   경력 / 학력 / 지역 / 마감
========================================================= */

function normalizeExperience(value) {
  let text =
    cleanValue(value);

  if (!text) return "";

  return text
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
      /EXPERIENCED/gi,
      "경력"
    )
    .replace(
      /\s*[,/]\s*/g,
      "·"
    )
    .replace(/\s+/g, " ")
    .trim();
}


function normalizeEducation(value) {
  const text =
    cleanValue(value);

  if (!text) return "";

  const upper =
    text.toUpperCase();

  if (
    upper.includes(
      "EDUCATION_NOT_REQUIRED"
    )
  ) {
    return "학력무관";
  }

  if (
    upper.includes("BACHELOR")
  ) {
    return "대졸";
  }

  if (
    upper.includes("ASSOCIATE")
  ) {
    return "전문대졸";
  }

  if (
    upper.includes("HIGH_SCHOOL")
  ) {
    return "고졸";
  }

  return text;
}


function shortLocation(location) {
  const value =
    cleanValue(location);

  if (!value) return "";

  const parts =
    value
      .split(/\s+/)
      .filter(Boolean);

  return parts
    .slice(0, 2)
    .join(" ");
}


function broadLocation(location) {
  const value =
    cleanValue(location);

  if (!value) return "";

  const regions = [
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

  for (const region of regions) {
    if (value.includes(region)) {
      return region;
    }
  }

  return (
    value.split(/\s+/)[0] || ""
  );
}


function normalizeDeadline(value) {
  const text =
    cleanValue(value);

  if (!text) return "";

  if (/상시/i.test(text)) {
    return "상시채용";
  }

  if (/채용시/i.test(text)) {
    return "채용시";
  }

  if (
    /20\d{2}[.\-/년]\s*\d{1,2}/.test(
      text
    )
  ) {
    return text;
  }

  const match =
    text.match(
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
   섹션 처리
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
      (item, index, array) =>
        array.indexOf(item) ===
        index
    )
    .slice(0, 12);
}


function combinedJobText(job) {
  return [
    job?.title,
    job?.duties,
    job?.requirements,
    job?.preferences,
    job?.workConditions,
  ]
    .filter(Boolean)
    .join("\n");
}


/* =========================================================
   추가정보 추론
========================================================= */

function inferContractPeriod(job) {
  const text =
    combinedJobText(job);

  const match =
    text.match(
      /(20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2})\s*[~～\-]\s*(20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2})/
    );

  return match
    ? `${match[1]} ~ ${match[2]}`
    : "";
}


function inferApplicationMethod(job) {
  const text =
    combinedJobText(job);

  const patterns = [
    /(?:접수방법|지원방법)\s*[:：]?\s*([^\n]{2,80})/i,
    /(온라인\s*지원)/i,
    /(홈페이지\s*지원)/i,
    /(자사\s*홈페이지\s*지원)/i,
    /(이메일\s*지원)/i,
  ];

  for (const regex of patterns) {
    const match =
      text.match(regex);

    if (match) {
      return cleanValue(
        match[1]
      );
    }
  }

  return "";
}


function inferRequiredQualifications(job) {
  const lines =
    sectionLines(
      job?.requirements
    );

  const priority =
    lines.filter(
      (line) =>
        /필수|면허|자격증|기사|간호사|산업위생|보건관리|경력\s*\d+/i.test(
          line
        )
    );

  return priority
    .slice(0, 4)
    .join(" + ");
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
    const response =
      await fetch(
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

          searchKeyword:
            keyword,

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

    const counts = {};

    currentJobs.forEach((job) => {
      counts[job.source] =
        (counts[job.source] || 0) + 1;
    });

    const summary =
      Object.entries(counts)
        .map(
          ([source, count]) =>
            `${source} ${count}건`
        )
        .join(" · ");

    const failures =
      Object.keys(
        data.errors || {}
      );

    let status =
      `총 ${currentJobs.length}건`;

    if (summary) {
      status +=
        ` (${summary})`;
    }

    if (failures.length) {
      status +=
        ` · 일부 검색 실패: ${failures.join(
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
        `검색 오류: ${error.message}`;
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
  const list =
    $("resultList");

  if (!list) return;

  list.innerHTML = "";

  jobs.forEach(
    (job, index) => {
      const item =
        document.createElement(
          "li"
        );

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
            normalizeTitle(
              job.title
            )
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
   상세조회
========================================================= */

async function fetchDetail(job) {
  if (!job?.url) {
    return job;
  }

  if (job.detailLoaded) {
    return job;
  }

  const url =
    `/api/detail?source=${encodeURIComponent(
      job.source || ""
    )}` +
    `&url=${encodeURIComponent(
      job.url
    )}`;

  const response =
    await fetch(url, {
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
      "상세정보 조회 실패"
    );
  }

  const detail =
    data.detail || {};

  return {
    ...job,

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
        detail.title,
        job.title
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

    process:
      firstValue(
        detail.process,
        job.process
      ),

    applicationMethod:
      firstValue(
        detail.applicationMethod,
        job.applicationMethod
      ),

    contractPeriod:
      firstValue(
        detail.contractPeriod,
        job.contractPeriod
      ),

    detailLoaded: true,
  };
}


async function ensureSelectedDetail() {
  if (!selectedJob) {
    return null;
  }

  if (selectedJob.detailLoaded) {
    return selectedJob;
  }

  if (detailLoading) {
    return detailLoading;
  }

  detailLoading =
    fetchDetail(selectedJob)
      .then((job) => {
        selectedJob = job;

        const index =
          currentJobs.findIndex(
            (item) =>
              item.url ===
              job.url
          );

        if (index >= 0) {
          currentJobs[index] =
            job;
        }

        updateSheet();

        return job;
      })
      .finally(() => {
        detailLoading = null;
      });

  return detailLoading;
}


/* =========================================================
   상세창
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
    } else {
      $("sheetMeta").textContent =
        [
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
        ]
          .filter(Boolean)
          .join(" · ");
    }
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
   상세 수정
========================================================= */

function setInput(id, value) {
  if ($(id)) {
    $(id).value =
      cleanValue(value);
  }
}


function fillDetailEditForm(job) {
  setInput(
    "d_company",
    companyName(job)
  );

  setInput(
    "d_jobTitle",
    guessJobLabel(job)
  );

  setInput(
    "d_location",
    job.location
  );

  setInput(
    "d_employment",
    guessEmploymentType(job)
  );

  setInput(
    "d_experience",
    normalizeExperience(
      job.experience
    )
  );

  setInput(
    "d_education",
    normalizeEducation(
      job.education
    )
  );

  setInput(
    "d_deadline",
    normalizeDeadline(
      job.deadline
    )
  );

  setInput(
    "d_duties",
    job.duties
  );

  setInput(
    "d_requirements",
    job.requirements
  );

  setInput(
    "d_preferences",
    job.preferences
  );

  setInput(
    "d_workConditions",
    job.workConditions
  );
}


function applyDetailEditForm() {
  if (!selectedJob) return;

  selectedJob = {
    ...selectedJob,

    company:
      cleanValue(
        $("d_company")?.value
      ),

    manualJobTitle:
      cleanValue(
        $("d_jobTitle")?.value
      ),

    location:
      cleanValue(
        $("d_location")?.value
      ),

    employment:
      normalizeEmployment(
        $("d_employment")?.value
      ),

    experience:
      normalizeExperience(
        $("d_experience")?.value
      ),

    education:
      normalizeEducation(
        $("d_education")?.value
      ),

    deadline:
      normalizeDeadline(
        $("d_deadline")?.value
      ),

    duties:
      cleanValue(
        $("d_duties")?.value
      ),

    requirements:
      cleanValue(
        $("d_requirements")?.value
      ),

    preferences:
      cleanValue(
        $("d_preferences")?.value
      ),

    workConditions:
      cleanValue(
        $("d_workConditions")?.value
      ),
  };

  updateSheet();

  showToast(
    "수정 내용을 반영했어요."
  );
}


/* =========================================================
   추천대상
========================================================= */

function buildRecommendedAudience(job) {
  const output = [];

  const requirements =
    sectionLines(
      job.requirements
    );

  const duties =
    sectionLines(
      job.duties
    );

  const preferences =
    sectionLines(
      job.preferences
    );

  const allText = [
    ...requirements,
    ...duties,
    ...preferences,
  ].join(" ");

  const experience =
    normalizeExperience(
      job.experience
    );

  const employment =
    guessEmploymentType(job);

  const location =
    broadLocation(
      job.location
    );

  if (
    /간호사.*면허/i.test(
      allText
    ) &&
    /산업위생관리기사/i.test(
      allText
    )
  ) {
    output.push(
      "간호사 면허와 산업위생관리기사를 모두 보유한 분"
    );
  } else {
    if (
      /간호사.*면허/i.test(
        allText
      )
    ) {
      output.push(
        "간호사 면허를 보유한 분"
      );
    }

    if (
      /산업위생관리기사/i.test(
        allText
      )
    ) {
      output.push(
        "산업위생관리기사를 보유한 분"
      );
    }
  }

  if (experience) {
    output.push(
      `${experience} 조건에 해당하는 분`
    );
  }

  if (
    /작업환경측정|화학물질|MSDS|근골격/i.test(
      allText
    )
  ) {
    output.push(
      "작업환경측정·화학물질·MSDS 등 산업위생 업무 경험이 있는 분"
    );
  }

  if (
    /제조업|자동차|공장|사업장/i.test(
      allText
    )
  ) {
    output.push(
      "제조업 사업장 보건관리 경험이 있는 분"
    );
  }

  if (
    /응급|응급처치/i.test(
      allText
    )
  ) {
    output.push(
      "사업장 내 응급상황 대응 경험이 있는 분"
    );
  }

  if (location) {
    output.push(
      `${location} 지역 출근이 가능한 분`
    );
  }

  if (
    employment.includes(
      "계약직"
    )
  ) {
    output.push(
      `${employment} 근무가 가능한 분`
    );
  }

  return [...new Set(output)]
    .slice(0, 7);
}


/* =========================================================
   체크리스트
========================================================= */

function buildChecklist(job) {
  const output = [];

  const requirements =
    sectionLines(
      job.requirements
    );

  const allText =
    requirements.join(" ");

  const experience =
    normalizeExperience(
      job.experience
    );

  const employment =
    guessEmploymentType(job);

  const deadline =
    normalizeDeadline(
      job.deadline
    );

  if (
    /간호사.*면허/i.test(
      allText
    ) &&
    /산업위생관리기사/i.test(
      allText
    )
  ) {
    output.push(
      "간호사 면허와 산업위생관리기사를 모두 보유하고 있는지 확인하세요."
    );
  } else {
    const required =
      inferRequiredQualifications(
        job
      );

    if (required) {
      output.push(
        `필수 자격요건(${required})을 충족하는지 확인하세요.`
      );
    }
  }

  if (experience) {
    output.push(
      `${experience} 경력조건을 충족하는지 확인하세요.`
    );
  }

  if (employment) {
    output.push(
      `${employment}이라는 고용형태를 확인하세요.`
    );
  }

  const contractPeriod =
    firstValue(
      job.contractPeriod,
      inferContractPeriod(job)
    );

  if (contractPeriod) {
    output.push(
      `계약기간(${contractPeriod})을 확인하세요.`
    );
  }

  const combined =
    combinedJobText(job);

  if (
    /작업환경측정|화학물질|MSDS|근골격/i.test(
      combined
    )
  ) {
    output.push(
      "작업환경측정·화학물질·MSDS·근골격계 관련 경험이 있다면 이력서에 구체적으로 작성해 보세요."
    );
  }

  if (
    /응급|응급처치/i.test(
      combined
    )
  ) {
    output.push(
      "사업장 응급대응 경험이 있다면 지원서에서 적극적으로 강조해 보세요."
    );
  }

  if (deadline) {
    output.push(
      `접수마감은 ${deadline}로 확인되므로 실제 지원 가능 여부를 공고 원문에서 다시 확인하세요.`
    );
  } else {
    output.push(
      "지원 전 접수마감일과 현재 모집 여부를 공고 원문에서 다시 확인하세요."
    );
  }

  return [...new Set(output)]
    .slice(0, 6);
}


/* =========================================================
   채용절차
========================================================= */

function extractRecruitmentProcess(job) {
  const direct =
    sectionLines(
      job.process
    );

  if (direct.length) {
    return direct;
  }

  const text =
    combinedJobText(job);

  const commonSteps = [
    "지원서 접수",
    "서류심사",
    "서류전형",
    "Phone Screen",
    "전화면접",
    "1차 면접",
    "2차 면접",
    "면접",
    "신체검사",
    "채용검진",
    "최종합격",
    "온보딩",
  ];

  return commonSteps.filter(
    (step) =>
      text
        .toLowerCase()
        .includes(
          step.toLowerCase()
        )
  );
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

  const region =
    broadLocation(location);

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

  const contractPeriod =
    firstValue(
      job.contractPeriod,
      inferContractPeriod(job)
    );

  const applicationMethod =
    firstValue(
      job.applicationMethod,
      inferApplicationMethod(job)
    );

  const requiredQualification =
    inferRequiredQualifications(
      job
    );

  const duties =
    sectionLines(
      job.duties
    );

  const requirements =
    sectionLines(
      job.requirements
    );

  const recommended =
    buildRecommendedAudience(
      job
    );

  const process =
    extractRecruitmentProcess(
      job
    );

  const checklist =
    buildChecklist(job);

  let introLocation = "";

  if (location) {
    introLocation =
      `${location}에서 근무하는 `;
  } else if (region) {
    introLocation =
      `${region} 지역에서 근무하는 `;
  }

  const intro =
    `${introLocation}**${company}의 ${jobLabel} 채용공고**를 공유드립니다.`;

  const summary = [
    ["회사명", company],
    ["모집 직무", jobLabel],
    ["근무지", location],
    [
      "근무 지역",
      region &&
      region !== location
        ? region
        : "",
    ],
    ["고용형태", employment],
    ["계약기간", contractPeriod],
    ["요구 경력", experience],
    ["학력", education],
    [
      "필수 자격",
      requiredQualification,
    ],
    ["접수마감", deadline],
    [
      "접수방법",
      applicationMethod,
    ],
    [
      "공고 출처",
      cleanValue(job.source),
    ],
  ]
    .filter(
      ([, value]) =>
        cleanValue(value)
    )
    .map(
      ([label, value]) =>
        `- ${label}: ${value}`
    );

  const lines = [
    "안녕하세요.",
    "",
    intro,
    "",
    "■ 채용공고 한눈에 보기",
    "",
    ...summary,
  ];

  if (duties.length) {
    lines.push(
      "",
      "■ 주요 담당업무",
      ""
    );

    duties.forEach((item) => {
      lines.push(
        `- ${item}`
      );
    });
  }

  if (requirements.length) {
    lines.push(
      "",
      "■ 지원자격",
      ""
    );

    requirements.forEach(
      (item) => {
        lines.push(
          `- ${item}`
        );
      }
    );
  }

  if (recommended.length) {
    lines.push(
      "",
      "■ 이런 분이 살펴보면 좋아요",
      ""
    );

    recommended.forEach(
      (item) => {
        lines.push(
          `- ${item}`
        );
      }
    );
  }

  if (process.length) {
    lines.push(
      "",
      "■ 채용절차",
      "",
      process.join("\n→ ")
    );
  }

  if (checklist.length) {
    lines.push(
      "",
      "■ 지원 전 체크리스트",
      ""
    );

    checklist.forEach(
      (item, index) => {
        lines.push(
          `${index + 1}. **${item}**`
        );
      }
    );
  }

  lines.push(
    "",
    "■ 공고 원문",
    "",
    job.url || ""
  );

  const hashtags = [];

  const addTag = (value) => {
    const tag =
      String(value || "")
        .replace(
          /[^가-힣a-zA-Z0-9]/g,
          ""
        )
        .trim();

    if (
      tag &&
      !hashtags.includes(tag)
    ) {
      hashtags.push(tag);
    }
  };

  addTag(jobLabel);
  addTag(
    `${jobLabel}채용`
  );

  if (
    jobLabel.includes("보건") ||
    jobLabel.includes("간호")
  ) {
    addTag("산업보건");
    addTag("산업간호사");
  }

  addTag(company);

  if (region) {
    addTag(
      `${region}채용`
    );
  }

  addTag("채용정보");
  addTag("고덕이네");

  lines.push(
    "",
    hashtags
      .slice(0, 9)
      .map(
        (tag) =>
          `#${tag}`
      )
      .join(" ")
  );

  return lines.join("\n");
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


function font(weight, size) {
  return (
    `${weight} ${size}px ` +
    `Pretendard, "Noto Sans KR", Arial, sans-serif`
  );
}


function roundRectPath(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  ctx.beginPath();

  if (ctx.roundRect) {
    ctx.roundRect(
      x,
      y,
      width,
      height,
      radius
    );
  } else {
    ctx.rect(
      x,
      y,
      width,
      height
    );
  }
}


function fitFontSize(
  ctx,
  text,
  weight,
  maxWidth,
  start,
  min
) {
  let size = start;

  while (size > min) {
    ctx.font =
      font(weight, size);

    if (
      ctx.measureText(text).width <=
      maxWidth
    ) {
      break;
    }

    size -= 2;
  }

  return size;
}


/* =========================================================
   카드 아이콘
========================================================= */

function drawCircleIcon(
  ctx,
  cx,
  cy,
  symbol
) {
  ctx.fillStyle =
    COLORS.paleBlue;

  ctx.beginPath();

  ctx.arc(
    cx,
    cy,
    43,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.fillStyle =
    COLORS.vividBlue;

  ctx.font =
    font(700, 30);

  ctx.textAlign =
    "center";

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    symbol,
    cx,
    cy
  );

  ctx.textAlign =
    "left";
}


/* =========================================================
   토끼 PNG
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
        mascotImg = null;
        mascotChecked = true;
        resolve(null);
      };

      image.src =
        "/icons/mascot-rabbit.png?v=15";
    }
  );
}


/* =========================================================
   썸네일 창
========================================================= */

function openThumbSheet() {
  if (!selectedJob) return;

  const job =
    selectedJob;

  const label =
    guessJobLabel(job);

  if ($("f_company")) {
    $("f_company").value =
      companyName(job);
  }

  if ($("f_jobLabel")) {
    $("f_jobLabel").value =
      label;
  }

  if ($("f_sub1")) {
    $("f_sub1").value =
      broadLocation(
        job.location
      );
  }

  if ($("f_sub2")) {
    $("f_sub2").value =
      `${label} 채용`;
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
   ★ 글자 왕큰 썸네일
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
    COLORS.navy;

  ctx.lineWidth = 8;

  roundRectPath(
    ctx,
    18,
    18,
    CANVAS_SIZE - 36,
    CANVAS_SIZE - 36,
    48
  );

  ctx.stroke();

  const pad = 58;


  /* 상단 라벨 */

  const labelText =
    `${jobLabel} 채용`;

  const labelSize =
    fitFontSize(
      ctx,
      labelText,
      800,
      450,
      50,
      30
    );

  ctx.font =
    font(
      800,
      labelSize
    );

  const labelWidth =
    Math.min(
      490,
      ctx.measureText(
        labelText
      ).width + 78
    );

  ctx.fillStyle =
    COLORS.navy;

  roundRectPath(
    ctx,
    pad,
    55,
    labelWidth,
    90,
    45
  );

  ctx.fill();

  ctx.fillStyle =
    COLORS.white;

  ctx.textBaseline =
    "middle";

  ctx.fillText(
    labelText,
    pad + 39,
    100
  );


  /* 회사명 - 존나 크게 */

  const companyMaxWidth =
    CANVAS_SIZE -
    pad * 2;

  const companySize =
    fitFontSize(
      ctx,
      company,
      900,
      companyMaxWidth,
      150,
      58
    );

  ctx.font =
    font(
      900,
      companySize
    );

  ctx.fillStyle =
    COLORS.navy;

  ctx.textBaseline =
    "alphabetic";

  ctx.fillText(
    company,
    pad,
    315
  );


  /* 구분선 */

  ctx.strokeStyle =
    COLORS.lightLine;

  ctx.lineWidth = 3;

  ctx.beginPath();

  ctx.moveTo(
    pad,
    360
  );

  ctx.lineTo(
    CANVAS_SIZE - pad,
    360
  );

  ctx.stroke();


  /* 지역 */

  let currentY = 480;

  if (sub1) {
    const locationSize =
      fitFontSize(
        ctx,
        sub1,
        800,
        720,
        92,
        46
      );

    ctx.font =
      font(
        800,
        locationSize
      );

    ctx.fillStyle =
      COLORS.blue;

    ctx.fillText(
      sub1,
      pad,
      currentY
    );

    currentY +=
      locationSize + 38;
  }


  /* 직무명 - 제일 크게 */

  const roleText =
    sub2 ||
    `${jobLabel} 채용`;

  const roleSize =
    fitFontSize(
      ctx,
      roleText,
      900,
      760,
      118,
      50
    );

  ctx.font =
    font(
      900,
      roleSize
    );

  ctx.fillStyle =
    COLORS.vividBlue;

  ctx.fillText(
    roleText,
    pad,
    currentY
  );


  /* 토끼 */

  if (
    $("f_useMascot")?.checked
  ) {
    const image =
      await getMascotImage();

    if (image) {
      const boxWidth = 320;
      const boxHeight = 350;

      const ratio =
        Math.min(
          boxWidth /
            image.width,
          boxHeight /
            image.height
        );

      const width =
        image.width * ratio;

      const height =
        image.height * ratio;

      const x =
        CANVAS_SIZE -
        width -
        8;

      const y =
        520 +
        (
          boxHeight -
          height
        ) /
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


  /* 카드 */

  const cards = [
    {
      symbol: "●",
      value: location,
      caption: "근무지",
    },
    {
      symbol: "▣",
      value: employment,
      caption: "고용형태",
    },
    {
      symbol: "♟",
      value: experience,
      caption: "경력/자격",
    },
    {
      symbol: "▦",
      value: deadline,
      caption: "접수마감",
    },
  ].filter(
    (card) =>
      cleanValue(card.value)
  );


  const cardTop = 765;
  const cardHeight = 215;
  const gap = 12;

  if (cards.length) {
    const availableWidth =
      CANVAS_SIZE -
      pad * 2;

    const cardWidth =
      (
        availableWidth -
        gap *
          (cards.length - 1)
      ) /
      cards.length;

    let currentX = pad;

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

      drawCircleIcon(
        ctx,
        centerX,
        cardTop + 52,
        card.symbol
      );

      const valueSize =
        fitFontSize(
          ctx,
          card.value,
          800,
          cardWidth - 16,
          40,
          19
        );

      ctx.font =
        font(
          800,
          valueSize
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
        cardTop + 140
      );

      ctx.font =
        font(
          500,
          22
        );

      ctx.fillStyle =
        COLORS.gray;

      ctx.fillText(
        card.caption,
        centerX,
        cardTop + 183
      );

      ctx.textAlign =
        "left";

      currentX +=
        cardWidth + gap;
    }
  }


  /* 고덕이네 */

  ctx.font =
    font(
      800,
      27
    );

  ctx.fillStyle =
    COLORS.navy;

  ctx.textAlign =
    "right";

  ctx.fillText(
    "고덕이네",
    CANVAS_SIZE - 50,
    1025
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


$("draftBtn")
  ?.addEventListener(
    "click",
    async () => {
      if (!selectedJob) return;

      try {
        await ensureSelectedDetail();
      } catch {}

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
          "초안을 복사했어요."
        );
      } catch {
        if ($("draftText")) {
          $("draftText").select();

          document.execCommand(
            "copy"
          );

          showToast(
            "초안을 복사했어요."
          );
        }
      }
    }
  );


$("thumbBtn")
  ?.addEventListener(
    "click",
    async () => {
      if (!selectedJob) return;

      try {
        await ensureSelectedDetail();
      } catch {}

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
              companyName(
                selectedJob
              ) ||
              "채용"
            ).replace(
              /[^\w가-힣()]/g,
              "_"
            );

          link.href = url;

          link.download =
            `썸네일_${fileName}.png`;

          document.body
            .appendChild(link);

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
