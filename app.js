(function () {
  "use strict";

  const form = document.getElementById("calculatorForm");
  const storageKey = "hk-mortgage-calculator-v1";
  const currency = new Intl.NumberFormat("zh-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  });
  const number = new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 0 });
  const percentage = new Intl.NumberFormat("zh-HK", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const money = (value) => currency.format(Math.round(Number.isFinite(value) ? value : 0));
  const pct = (value) => Number.isFinite(value) ? percentage.format(value) : "—";
  const byId = (id) => document.getElementById(id);

  function valuesFromForm() {
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll("input[type=number]").forEach((input) => {
      data[input.name] = Number(input.value);
    });
    data.years = Number(data.years);
    data.hasGovernmentRent = byId("hasGovernmentRent").checked;
    data.autoDsr = byId("autoDsr").checked;
    return data;
  }

  function updateReadouts(values) {
    const readouts = {
      price: money(values.price),
      valuation: money(values.valuation),
      salary: money(values.salary),
      area: `${number.format(values.area || 0)} 尺`,
      ltvPercent: `${values.ltvPercent || 0}%`,
      otherDebt: money(values.otherDebt),
      primeRate: `${Number(values.primeRate || 0).toFixed(2)}%`,
      desiredTier2: money(values.desiredTier2),
      rateableValuePercent: `${values.rateableValuePercent || 0}%`,
      managementRate: `HK$${Number(values.managementRate || 0).toFixed(1)}`,
      maintenanceMonthly: money(values.maintenanceMonthly),
      agencyRate: `${values.agencyRate || 0}%`,
      legalFee: money(values.legalFee),
      renovationRate: money(values.renovationRate),
      mortgageInsuranceRate: `${values.mortgageInsuranceRate || 0}%`,
      miscFee: money(values.miscFee),
    };
    Object.entries(readouts).forEach(([key, value]) => {
      const output = document.querySelector(`[data-readout="${key}"]`);
      if (output) output.textContent = value;
    });
  }

  function setText(id, value) {
    byId(id).textContent = value;
  }

  function renderStatus(result) {
    const banner = byId("eligibilityBanner");
    const reasons = [];
    if (!result.eligibleLtv) reasons.push("按揭成数超过计划上限或楼价资料未完整");
    if (!result.eligibleDsr) reasons.push(`DSR ${pct(result.dsr)} 超过 50%`);
    if (!result.eligiblePlan) reasons.push("第二层贷款超过第一层贷款，超出截图计划范围");

    let title = result.eligible ? "通过当前参数检查" : "当前方案未通过计划条件";
    let description = result.eligible
      ? `贷款额、两层比例及 DSR 均在截图规则内；最终仍以银行批核为准。`
      : reasons.join("；");

    if (result.autoDsr && result.loan.tier1 + 0.01 < result.loan.tier1Cap) {
      title = "物业按揭上限低于第一层额度";
      description = `目前最多贷款 ${money(result.requestedLoan)}；若要第一层贷满 ${money(result.loan.tier1Cap)}，成交价与估价较低者至少要达到 ${money(result.propertyValueForTier1Full)}。`;
    } else if (result.autoDsr && result.actualTier2 + 0.01 < result.desiredTier2) {
      const limits = [];
      if (result.constrainedByDsr) limits.push("DSR 50%");
      if (result.constrainedByProperty) limits.push("物业按揭成数");
      if (result.constrainedByPlan) limits.push("第二层不得超过第一层");
      title = "第二层已自动调整至可贷范围";
      description = `目标 ${money(result.desiredTier2)}，实际 ${money(result.actualTier2)}；限制因素：${limits.join("、") || "员工贷款计划"}。`;
    } else if (result.autoDsr) {
      title = result.actualTier2 > 0 ? "已按第二层目标金额计算" : "当前只使用第一层贷款";
      description = `第一层 ${money(result.loan.tier1)}，第二层 ${money(result.loan.tier2)}，当前 DSR 为 ${pct(result.dsr)}。`;
    }

    banner.classList.toggle("is-warning", !result.eligible);
    banner.querySelector(".status-icon").textContent = result.eligible ? "✓" : "!";
    setText("eligibilityTitle", title);
    setText("eligibilityText", description);
  }

  function renderBreakdown(containerId, items, total) {
    const container = byId(containerId);
    container.replaceChildren();
    items.forEach((item) => {
      const row = document.createElement("div");
      const ratio = total > 0 ? Math.max(0, item.value / total) : 0;
      row.innerHTML = `<dt><i style="--item-color:${item.color}"></i><span>${item.label}</span></dt><dd><strong>${money(item.value)}</strong><span>${pct(ratio)}</span></dd>`;
      container.appendChild(row);
    });
  }

  function renderChart(items, total) {
    const chart = byId("monthlyChart");
    chart.replaceChildren();
    items.forEach((item) => {
      const segment = document.createElement("span");
      segment.style.width = `${total > 0 ? item.value / total * 100 : 0}%`;
      segment.style.backgroundColor = item.color;
      segment.title = `${item.label}: ${money(item.value)}`;
      chart.appendChild(segment);
    });
  }

  function render(result) {
    const values = valuesFromForm();
    updateReadouts(values);

    setText("salaryHeadline", money(result.input.salary));
    setText("upfrontKpi", money(result.upfront));
    setText("monthlyHoldingKpi", money(result.monthlyHolding));
    setText("housingRatioKpi", `占月薪 ${pct(result.housingRatio)}`);
    setText("mortgageKpi", money(result.loan.totalPayment));
    setText("mortgageRateKpi", `第一层 ${result.loan.tier1First.toFixed(2)}% · 第二层 ${result.loan.tier2Rate.toFixed(2)}%`);
    setText("dsrKpi", pct(result.dsr));
    renderStatus(result);

    setText("requestedLoanValue", money(result.requestedLoan));
    setText("tier1Amount", money(result.loan.tier1));
    setText("tier2Amount", money(result.loan.tier2));
    setText("tier1Meta", `${result.loan.tier1First.toFixed(2)}% · ${money(result.loan.tier1Payment)}/月`);
    setText("tier2Meta", `目标 ${money(result.desiredTier2)} · ${result.loan.tier2Rate.toFixed(2)}% · ${money(result.loan.tier2Payment)}/月`);
    setText("downPaymentValue", money(result.downPayment));
    setText("loanBaseMeta", `物业按揭上限 ${money(result.propertyLoanCap)}`);
    setText("totalInterestValue", money(result.totalInterest));
    setText("termMeta", `${result.input.years}年等额本息`);
    const tier1Width = result.requestedLoan ? result.loan.tier1 / result.requestedLoan * 100 : 0;
    byId("tier1Bar").style.width = `${tier1Width}%`;
    byId("tier2Bar").style.width = `${100 - tier1Width}%`;

    const dsrVisual = Math.min(Math.max(result.dsr, 0), 1);
    byId("dsrRing").style.setProperty("--dsr", `${dsrVisual * 360}deg`);
    byId("dsrRing").classList.toggle("over-limit", result.dsr > 0.5);
    setText("dsrRingValue", pct(result.dsr));
    setText("debtLimitValue", money(result.input.salary * result.policy.dsrLimit));
    setText("maxDsrLoanValue", money(result.dsrLoanCap));
    setText("maxTier2Value", money(result.tier2AvailableCap));
    setText("tier2LimitHint", `当前综合上限 ${money(result.tier2AvailableCap)} · DSR上限 ${money(result.tier2DsrCap)} · 物业余量 ${money(result.tier2PropertyCap)}`);
    setText("maxPropertyValue", money(result.affordablePriceAtLtv));
    setText("disposableValue", money(result.disposableAfterHousing));
    setText("currentScenario", `${money(result.loan.totalPayment)}/月`);
    setText("stressScenario", `${money(result.stress.totalPayment)}/月`);
    setText("stressDsrValue", pct(result.stressDsr));
    setText("fullTierIncomeValue", `${money(result.incomeForBothTiersFull)}/月`);
    const tag = byId("affordabilityTag");
    tag.textContent = result.eligibleDsr ? "DSR 合格" : "DSR 超标";
    tag.classList.toggle("tag-warning", !result.eligibleDsr);

    const monthlyItems = [
      { label: "房贷月供", value: result.loan.totalPayment, color: "#19362f" },
      { label: "差饷（月均）", value: result.ratesAnnual / 12, color: "#db765f" },
      { label: "地租（月均）", value: result.governmentRentAnnual / 12, color: "#2f80a0" },
      { label: "管理费", value: result.managementMonthly, color: "#d5a73f" },
      { label: "维修储备", value: result.maintenanceMonthly, color: "#908b82" },
    ].filter((item) => item.value > 0.005);
    setText("monthlyTotalValue", money(result.monthlyHolding));
    renderChart(monthlyItems, result.monthlyHolding);
    renderBreakdown("monthlyBreakdown", monthlyItems, result.monthlyHolding);

    const upfrontItems = [
      { label: "现金首期", value: result.downPayment, color: "#19362f" },
      { label: "从价印花税", value: result.duty, color: "#db765f" },
      { label: "中介佣金", value: result.agencyFee, color: "#2f80a0" },
      { label: "律师费", value: result.legalFee, color: "#d5a73f" },
      { label: "装修预算", value: result.renovation, color: "#796eb2" },
      { label: "按揭保险", value: result.mortgageInsurance, color: "#ba7d9b" },
      { label: "杂费 / 搬屋 / 家电", value: result.miscFee, color: "#908b82" },
    ].filter((item) => item.value > 0.005);
    setText("upfrontTotalValue", money(result.upfront));
    renderBreakdown("upfrontBreakdown", upfrontItems, result.upfront);
    setText("timelineDownPayment", money(result.downPayment));
    setText("timelineTransaction", money(result.duty + result.agencyFee + result.legalFee + result.mortgageInsurance));
    setText("timelineFitout", money(result.renovation + result.miscFee));

    window.__mortgageResult = result;
  }

  function calculate() {
    const values = valuesFromForm();
    const result = window.HKMortgage.derive(values);
    render(result);
    try {
      localStorage.setItem(storageKey, JSON.stringify(values));
    } catch (_) {
      // The calculator remains fully functional when storage is unavailable.
    }
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (!saved) return;
      if (saved.managementRate === 4.2) saved.managementRate = 3.5;
      if (saved.renovationRate === 1_500) saved.renovationRate = 1_000;
      if (saved.maintenanceMonthly === 0) saved.maintenanceMonthly = 1_500;
      Object.entries(saved).forEach(([key, value]) => {
        const input = form.elements.namedItem(key);
        if (!input) return;
        if (input.type === "checkbox") input.checked = Boolean(value);
        else input.value = value;
      });
    } catch (_) {
      localStorage.removeItem(storageKey);
    }
  }

  function exportCsv() {
    const r = window.__mortgageResult;
    if (!r) return;
    const rows = [
      ["香港房贷及持有成本", "金额/比率"],
      ["成交价", r.input.price],
      ["银行估价", r.input.valuation],
      ["月薪", r.input.salary],
      ["申请贷款", Math.round(r.requestedLoan)],
      ["物业按揭上限", Math.round(r.propertyLoanCap)],
      ["第一层贷款", Math.round(r.loan.tier1)],
      ["第一层利率", `${r.loan.tier1First.toFixed(2)}%`],
      ["第二层贷款", Math.round(r.loan.tier2)],
      ["第二层目标贷款", Math.round(r.desiredTier2)],
      ["第二层利率", `${r.loan.tier2Rate.toFixed(2)}%`],
      ["每月房贷", Math.round(r.loan.totalPayment)],
      ["每月差饷", Math.round(r.ratesAnnual / 12)],
      ["每月地租", Math.round(r.governmentRentAnnual / 12)],
      ["每月管理费", Math.round(r.managementMonthly)],
      ["每月持有成本", Math.round(r.monthlyHolding)],
      ["DSR", `${(r.dsr * 100).toFixed(1)}%`],
      ["第二层综合可贷上限", Math.round(r.tier2AvailableCap)],
      ["现金首期", Math.round(r.downPayment)],
      ["从价印花税", Math.round(r.duty)],
      ["中介佣金", Math.round(r.agencyFee)],
      ["律师费", Math.round(r.legalFee)],
      ["装修预算", Math.round(r.renovation)],
      ["按揭保险", Math.round(r.mortgageInsurance)],
      ["其他一次性支出", Math.round(r.miscFee)],
      ["买房初期现金", Math.round(r.upfront)],
    ];
    const csv = "\ufeff" + rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "香港房贷及持有成本明细.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  form.addEventListener("input", calculate);
  form.addEventListener("change", calculate);
  byId("printButton").addEventListener("click", () => window.print());
  byId("exportButton").addEventListener("click", exportCsv);
  byId("fillTier2MaxButton").addEventListener("click", () => {
    const limit = window.__mortgageResult?.tier2AvailableCap || 0;
    byId("desiredTier2").value = Math.floor(limit);
    calculate();
  });
  byId("resetButton").addEventListener("click", () => {
    form.reset();
    localStorage.removeItem(storageKey);
    calculate();
  });

  restore();
  calculate();
})();
