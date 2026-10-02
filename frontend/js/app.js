/* ==================================================
   URJA MITRA FRONTEND APPLICATION
   Smart Renewable Energy Utilization & Management System
================================================== */

const API_BASE = "/api";

let energyChart = null;
let energyData = [];
let applianceData = [];
let alertData = [];
let scheduleData = [];


/* ==================================================
   INITIALIZATION
================================================== */

document.addEventListener("DOMContentLoaded", () => {

    setupNavigation();
    setupOptimizer();
    setupScheduleManagement();

    setDefaultScheduleDate();

    loadDashboard();

});


/* ==================================================
   NAVIGATION
================================================== */

function setupNavigation() {

    const navLinks =
        document.querySelectorAll(".nav-link");

    navLinks.forEach(link => {

        link.addEventListener("click", event => {

            event.preventDefault();

            const href =
                link.getAttribute("href");

            if (!href || !href.startsWith("#")) {
                return;
            }

            const sectionId =
                href.substring(1);

            const target =
                document.getElementById(sectionId);

            if (!target) {
                return;
            }

            navLinks.forEach(item => {
                item.classList.remove("active");
            });

            link.classList.add("active");

            target.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        });

    });


    const sections =
        document.querySelectorAll(
            "main section[id]"
        );


    const observer =
        new IntersectionObserver(
            entries => {

                entries.forEach(entry => {

                    if (!entry.isIntersecting) {
                        return;
                    }

                    const id =
                        entry.target.id;

                    navLinks.forEach(link => {

                        const href =
                            link.getAttribute("href");

                        link.classList.toggle(
                            "active",
                            href === `#${id}`
                        );

                    });

                });

            },
            {
                threshold: 0.25
            }
        );


    sections.forEach(section => {
        observer.observe(section);
    });

}


/* ==================================================
   API HELPER
================================================== */

async function apiRequest(
    endpoint,
    options = {}
) {

    const response =
        await fetch(
            `${API_BASE}${endpoint}`,
            {
                ...options,
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                }
            }
        );


    let data;

    try {

        data =
            await response.json();

    } catch {

        throw new Error(
            `Server returned an invalid response (${response.status}).`
        );

    }


    if (!response.ok) {

        throw new Error(
            data.message ||
            `API request failed: ${response.status}`
        );

    }


    if (data.status === "error") {

        throw new Error(
            data.message ||
            "API returned an error."
        );

    }


    return data;

}


function settledApiValue(
    result,
    label,
    errors
) {

    if (
        result.status ===
        "fulfilled"
    ) {

        return result.value;

    }


    const message =
        result.reason &&
        result.reason.message
            ? result.reason.message
            : "Request failed.";


    console.error(
        `${label} loading error:`,
        result.reason
    );


    errors.push(
        `${label}: ${message}`
    );


    return null;

}


/* ==================================================
   LOAD DASHBOARD
================================================== */

async function loadDashboard() {

    setLastUpdated("Loading data...");

    setDailyPlanLoading();


    const errors = [];


    try {

        const results =
            await Promise.allSettled([

                apiRequest("/dashboard-summary"),

                apiRequest("/energy"),

                apiRequest("/appliances"),

                apiRequest("/alerts"),

                apiRequest("/schedules"),

                apiRequest(
                    `/daily-plan?date=${encodeURIComponent(getTodayDate())}`
                )

            ]);


        const summaryResponse =
            settledApiValue(
                results[0],
                "Dashboard summary",
                errors
            );

        const energyResponse =
            settledApiValue(
                results[1],
                "Energy data",
                errors
            );

        const appliancesResponse =
            settledApiValue(
                results[2],
                "Appliances",
                errors
            );

        const alertsResponse =
            settledApiValue(
                results[3],
                "Alerts",
                errors
            );

        const schedulesResponse =
            settledApiValue(
                results[4],
                "Schedules",
                errors
            );

        const dailyPlanResponse =
            settledApiValue(
                results[5],
                "Daily plan",
                errors
            );


        const summary =
            summaryResponse &&
            summaryResponse.summary
                ? summaryResponse.summary
                : {};

        energyData =
            energyResponse &&
            energyResponse.data
                ? energyResponse.data
                : [];

        applianceData =
            appliancesResponse &&
            appliancesResponse.data
                ? appliancesResponse.data
                : [];

        alertData =
            alertsResponse &&
            alertsResponse.data
                ? alertsResponse.data
                : [];

        scheduleData =
            schedulesResponse &&
            schedulesResponse.data
                ? schedulesResponse.data
                : [];


        if (summaryResponse) {

            renderSummary(summary);

            renderPerformance(summary);

            renderDataQuality(summary);

        }


        renderEnergyChart(energyData);

        renderEnergyTableData(energyData);

        renderSystemInformation(
            summary,
            energyData
        );

        renderPeakWindow(energyData);

        renderAppliances(applianceData);

        renderAlerts(alertData);

        populateScheduleAppliances(
            applianceData
        );

        renderScheduleList(
            scheduleData,
            schedulesResponse
                ? null
                : errors.find(
                    item =>
                        item.startsWith(
                            "Schedules:"
                        )
                )
        );

        renderDailyPlan(
            dailyPlanResponse,
            dailyPlanResponse
                ? null
                : errors.find(
                    item =>
                        item.startsWith(
                            "Daily plan:"
                        )
                )
        );


        const notice =
            document.getElementById(
                "systemNoticeText"
            );


        if (notice) {

            if (errors.length) {

                notice.textContent =
                    `Some dashboard data could not be loaded. ${errors.join(" ")}`;

            } else {

                notice.textContent =
                    `${energyData.length} energy readings are being used for the current dashboard analysis.`;

            }

        }


        if (errors.length) {

            setLastUpdated(
                `Last updated with incomplete data: ${formatDateTime(new Date())}`
            );

        } else {

            setLastUpdated(
                `Last updated: ${formatDateTime(new Date())}`
            );

        }


        if (
            !summaryResponse &&
            !energyResponse
        ) {

            showDashboardError(
                errors.join(" ")
            );

        }


    } catch (error) {

        console.error(
            "Dashboard loading error:",
            error
        );


        showDashboardError(
            error.message
        );

    }

}


/* ==================================================
   SUMMARY
================================================== */

function renderSummary(summary) {

    setText(
        "totalRenewable",
        formatNumber(
            summary.totalRenewableGeneration
        )
    );


    setText(
        "totalConsumption",
        formatNumber(
            summary.totalEnergyConsumption
        )
    );


    setText(
        "totalGridImport",
        formatNumber(
            summary.totalGridImport
        )
    );


    setText(
        "estimatedCO2Avoided",
        formatNumber(
            summary.estimatedCO2AvoidedKg
        )
    );

}


/* ==================================================
   PERFORMANCE
================================================== */

function renderPerformance(summary) {

    const renewableUtilization =
        safePercentage(
            summary.renewableUtilization
        );


    const gridDependency =
        safePercentage(
            summary.gridDependency
        );


    const renewableShare =
        safePercentage(
            summary.renewableShare
        );


    setText(
        "renewableUtilization",
        `${formatNumber(renewableUtilization)}%`
    );


    setText(
        "gridDependency",
        `${formatNumber(gridDependency)}%`
    );


    setText(
        "renewableShare",
        `${formatNumber(renewableShare)}%`
    );


    setWidth(
        "renewableUtilizationBar",
        renewableUtilization
    );


    setWidth(
        "gridDependencyBar",
        gridDependency
    );


    setWidth(
        "renewableShareBar",
        renewableShare
    );


    setText(
        "renewableShareLarge",
        formatNumber(renewableShare)
    );

}


/* ==================================================
   SYSTEM INFORMATION
================================================== */

function renderSystemInformation(
    summary,
    energy
) {

    setText(
        "readings",
        summary.readings ??
        energy.length ??
        0
    );


    setText(
        "totalAppliances",
        summary.totalAppliances ??
        applianceData.length
    );


    setText(
        "totalAlerts",
        summary.totalAlerts ??
        alertData.length
    );


    setText(
        "totalSchedules",
        summary.totalSchedules ??
        0
    );

}


/* ==================================================
   ENERGY CHART
================================================== */

function renderEnergyChart(data) {

    const canvas =
        document.getElementById(
            "energyChart"
        );


    if (!canvas) {
        return;
    }


    if (
        typeof Chart ===
        "undefined"
    ) {

        console.error(
            "Chart.js is not available."
        );

        return;

    }


    if (
        !data ||
        data.length === 0
    ) {

        if (energyChart) {
            energyChart.destroy();
            energyChart = null;
        }

        return;

    }


    const labels =
        data.map(row =>
            formatTime(
                row.reading_time
            )
        );


    const renewable =
        data.map(row =>
            Number(
                row.renewable_generation
            ) || 0
        );


    const consumption =
        data.map(row =>
            Number(
                row.energy_consumption
            ) || 0
        );


    const grid =
        data.map(row =>
            Number(
                row.grid_import
            ) || 0
        );


    if (energyChart) {
        energyChart.destroy();
    }


    energyChart =
        new Chart(
            canvas,
            {

                type: "line",

                data: {

                    labels,

                    datasets: [

                        {
                            label:
                                "Renewable Generation",

                            data:
                                renewable,

                            borderColor:
                                "#1f7a4d",

                            backgroundColor:
                                "rgba(31, 122, 77, 0.08)",

                            borderWidth:
                                2,

                            fill:
                                true,

                            tension:
                                0.25,

                            pointRadius:
                                2,

                            pointHoverRadius:
                                4
                        },


                        {
                            label:
                                "Energy Consumption",

                            data:
                                consumption,

                            borderColor:
                                "#245b85",

                            backgroundColor:
                                "transparent",

                            borderWidth:
                                2,

                            fill:
                                false,

                            tension:
                                0.25,

                            pointRadius:
                                2,

                            pointHoverRadius:
                                4
                        },


                        {
                            label:
                                "Grid Import",

                            data:
                                grid,

                            borderColor:
                                "#b86b00",

                            backgroundColor:
                                "transparent",

                            borderWidth:
                                1.5,

                            borderDash:
                                [5, 4],

                            fill:
                                false,

                            tension:
                                0.25,

                            pointRadius:
                                2,

                            pointHoverRadius:
                                4
                        }

                    ]

                },


                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,

                    interaction: {

                        intersect:
                            false,

                        mode:
                            "index"

                    },


                    plugins: {

                        legend: {

                            position:
                                "bottom",

                            labels: {

                                boxWidth:
                                    10,

                                padding:
                                    14,

                                font: {

                                    size:
                                        10

                                }

                            }

                        },


                        tooltip: {

                            callbacks: {

                                label: context => {

                                    return `${context.dataset.label}: ${formatNumber(context.parsed.y)} kWh`;

                                }

                            }

                        }

                    },


                    scales: {

                        x: {

                            grid: {

                                display:
                                    false

                            },

                            ticks: {

                                font: {

                                    size:
                                        9

                                }

                            }

                        },


                        y: {

                            beginAtZero:
                                true,

                            title: {

                                display:
                                    true,

                                text:
                                    "Energy (kWh)"

                            },

                            ticks: {

                                font: {

                                    size:
                                        9

                                }

                            }

                        }

                    }

                }

            }
        );

}


/* ==================================================
   ENERGY TABLE / DATA SUPPORT
================================================== */

function renderEnergyTableData(data) {

    if (
        !data ||
        data.length === 0
    ) {
        return;
    }


    const first =
        data[0];


    if (
        first &&
        Object.prototype.hasOwnProperty.call(
            first,
            "renewable_generation"
        )
    ) {
        return;
    }

}


/* ==================================================
   PEAK RENEWABLE WINDOW
================================================== */

function renderPeakWindow(data) {

    if (
        !data ||
        data.length === 0
    ) {

        setText(
            "peakTime",
            "--"
        );

        setText(
            "peakRenewable",
            "--"
        );

        return;

    }


    const peak =
        data.reduce(
            (highest, current) => {

                const currentValue =
                    Number(
                        current.renewable_generation
                    ) || 0;

                const highestValue =
                    Number(
                        highest.renewable_generation
                    ) || 0;


                return currentValue >
                    highestValue

                    ? current

                    : highest;

            },
            data[0]
        );


    const generation =
        Number(
            peak.renewable_generation
        ) || 0;


    setText(
        "peakTime",
        formatTime(
            peak.reading_time
        )
    );


    setText(
        "peakRenewable",
        formatNumber(
            generation
        )
    );

}


/* ==================================================
   DAILY PLAN
================================================== */

function setDailyPlanLoading() {

    setText(
        "dailyPlanWindow",
        "--"
    );

    setText(
        "dailyPlanDescription",
        "Generating the Smart Daily Plan from current energy conditions..."
    );

    setText(
        "dailyPlanFlexible",
        "--"
    );

    setText(
        "dailyPlanRenewable",
        "--"
    );

    setText(
        "dailyPlanGridReduction",
        "--"
    );

    setText(
        "dailyPlanStatus",
        "Loading"
    );

}


function renderDailyPlan(
    planResponse,
    errorMessage
) {

    if (
        errorMessage ||
        !planResponse
    ) {

        setText(
            "dailyPlanWindow",
            "--"
        );

        setText(
            "dailyPlanDescription",
            errorMessage ||
            "Unable to load the Smart Daily Plan."
        );

        setText(
            "dailyPlanFlexible",
            "--"
        );

        setText(
            "dailyPlanRenewable",
            "--"
        );

        setText(
            "dailyPlanGridReduction",
            "--"
        );

        setText(
            "dailyPlanStatus",
            "Unavailable"
        );

        return;

    }


    const plan =
        planResponse.plan || {};

    const items =
        Array.isArray(plan.items)
            ? plan.items
            : [];


    if (items.length === 0) {

        setText(
            "dailyPlanWindow",
            "--"
        );

        setText(
            "dailyPlanDescription",
            "No daily-plan items were returned for the current energy dataset."
        );

        setText(
            "dailyPlanFlexible",
            "0"
        );

        setText(
            "dailyPlanRenewable",
            "--"
        );

        setText(
            "dailyPlanGridReduction",
            "--"
        );

        setText(
            "dailyPlanStatus",
            "No plan items"
        );

        return;

    }


    const plannedItems =
        items.filter(
            item =>
                item.status ===
                "Recommended" ||
                item.status ===
                "Already Scheduled"
        );


    const windowItems =
        plannedItems.length
            ? plannedItems
            : items;


    const highlight =
        windowItems.reduce(
            (best, item) => {

                const currentRenewable =
                    Number(
                        item.renewableEnergyUsed
                    ) || 0;

                const bestRenewable =
                    Number(
                        best.renewableEnergyUsed
                    ) || 0;


                return currentRenewable >
                    bestRenewable
                    ? item
                    : best;

            },
            windowItems[0]
        );


    setText(
        "dailyPlanWindow",
        `${formatTime(highlight.start)} - ${formatTime(highlight.end)}`
    );


    const dateLabel =
        formatScheduleDate(
            planResponse.date
        );

    const generatedBy =
        plan.generatedBy ||
        "Urja Mitra Optimizer";

    const existingCount =
        Number(
            plan.existingSchedulesConsidered
        ) || 0;


    setText(
        "dailyPlanDescription",
        `${generatedBy} for ${dateLabel}. ${existingCount} existing schedule${existingCount === 1 ? "" : "s"} considered.`
    );


    const flexible =
        items.filter(
            item =>
                item.status !==
                "Fixed"
        ).length;


    const plannedRenewable =
        plannedItems.reduce(
            (total, item) =>
                total +
                (
                    Number(
                        item.renewableEnergyUsed
                    ) || 0
                ),
            0
        );


    const plannedEnergy =
        plannedItems.reduce(
            (total, item) =>
                total +
                (
                    Number(
                        item.energyRequired
                    ) || 0
                ),
            0
        );


    const plannedGridUsage =
        plannedItems.reduce(
            (total, item) =>
                total +
                (
                    Number(
                        item.estimatedGridUsage
                    ) || 0
                ),
            0
        );


    const plannedGridReduction =
        Math.max(
            0,
            plannedEnergy -
            plannedGridUsage
        );


    setText(
        "dailyPlanFlexible",
        flexible
    );

    setText(
        "dailyPlanRenewable",
        `${formatNumber(plannedRenewable)} kWh`
    );

    setText(
        "dailyPlanGridReduction",
        `${formatNumber(plannedGridReduction)} kWh`
    );

    setText(
        "dailyPlanStatus",
        planResponse.status ===
        "success"
            ? "Ready"
            : (
                planResponse.status ||
                "Ready"
            )
    );

}


/* ==================================================
   APPLIANCES
================================================== */

function renderAppliances(data) {

    const container =
        document.getElementById(
            "applianceList"
        );


    if (!container) {
        return;
    }


    const badge =
        document.getElementById(
            "applianceCountBadge"
        );


    if (
        !data ||
        data.length === 0
    ) {

        container.innerHTML =
            `<div class="empty-state">
                No appliances found.
            </div>`;


        if (badge) {
            badge.textContent =
                "0 Appliances";
        }

        return;

    }


    if (badge) {

        badge.textContent =
            `${data.length} Appliance${data.length === 1 ? "" : "s"}`;

    }


    container.innerHTML =
        data.map(
            appliance => {

                const priority =
                    String(
                        appliance.priority ||
                        "Medium"
                    );


                const flexible =
                    Number(
                        appliance.flexible
                    ) === 1 ||
                    appliance.flexible === true;


                const duration =
                    Number(
                        appliance.duration_minutes
                    ) || 0;


                return `

                    <div class="data-row">

                        <div>

                            <div class="data-title">
                                ${escapeHtml(
                                    appliance.appliance_name
                                )}
                            </div>

                            <div class="data-text">

                                ${formatNumber(
                                    appliance.power_consumption
                                )}
                                kW

                                &nbsp;|&nbsp;

                                ${flexible
                                    ? "Flexible load"
                                    : "Fixed load"}

                                &nbsp;|&nbsp;

                                ${duration}
                                min

                            </div>

                        </div>


                        <div>

                            <span
                                class="badge ${
                                    priority.toLowerCase() === "high"
                                        ? "badge-danger"
                                        : priority.toLowerCase() === "low"
                                            ? "badge-info"
                                            : "badge-success"
                                }"
                            >
                                ${escapeHtml(priority)}
                            </span>

                        </div>

                    </div>

                `;

            }
        ).join("");

}


/* ==================================================
   ALERTS
================================================== */

function renderAlerts(data) {

    const container =
        document.getElementById(
            "alertList"
        );


    if (!container) {
        return;
    }


    const badge =
        document.getElementById(
            "alertCountBadge"
        );


    if (
        !data ||
        data.length === 0
    ) {

        container.innerHTML =
            `<div class="empty-state">
                No active energy alerts.
            </div>`;


        if (badge) {
            badge.textContent =
                "No Alerts";
            badge.className =
                "badge badge-success";
        }

        return;

    }


    if (badge) {

        badge.textContent =
            `${data.length} Alert${data.length === 1 ? "" : "s"}`;

    }


    container.innerHTML =
        data.map(
            alert => {

                const severity =
                    String(
                        alert.severity ||
                        "Info"
                    );


                let badgeClass =
                    "badge-info";


                if (
                    severity.toLowerCase() ===
                    "warning"
                ) {

                    badgeClass =
                        "badge-warning";

                } else if (
                    severity.toLowerCase() ===
                    "critical" ||
                    severity.toLowerCase() ===
                    "danger"
                ) {

                    badgeClass =
                        "badge-danger";

                } else if (
                    severity.toLowerCase() ===
                    "info"
                ) {

                    badgeClass =
                        "badge-info";

                }


                return `

                    <div class="data-row">

                        <div>

                            <div class="data-title">
                                ${escapeHtml(
                                    alert.alert_type ||
                                    "Energy Alert"
                                )}
                            </div>


                            <div class="data-text">
                                ${escapeHtml(
                                    alert.alert_message ||
                                    ""
                                )}
                            </div>

                        </div>


                        <div>

                            <span
                                class="badge ${badgeClass}"
                            >
                                ${escapeHtml(severity)}
                            </span>

                        </div>

                    </div>

                `;

            }
        ).join("");

}


/* ==================================================
   DATA QUALITY
================================================== */

function renderDataQuality(summary) {

    const quality =
        safePercentage(
            summary.dataQualityPercent
        );


    setText(
        "dataQualityPercent",
        `${formatNumber(quality)}%`
    );


    setWidth(
        "dataQualityBar",
        quality
    );


    const badge =
        document.getElementById(
            "dataQualityBadge"
        );


    if (badge) {

        if (quality >= 95) {

            badge.textContent =
                "Consistent";

            badge.className =
                "badge badge-success";

        } else if (quality >= 80) {

            badge.textContent =
                "Review";

            badge.className =
                "badge badge-warning";

        } else {

            badge.textContent =
                "Attention Required";

            badge.className =
                "badge badge-danger";

        }

    }


    const description =
        document.getElementById(
            "dataQualityDescription"
        );


    if (!description) {
        return;
    }


    const balanced =
        Number(
            summary.balancedReadings
        ) || 0;


    const unbalanced =
        Number(
            summary.unbalancedReadings
        ) || 0;


    if (unbalanced === 0) {

        description.textContent =
            `${balanced} energy readings passed the configured energy-balance consistency check.`;

    } else {

        description.textContent =
            `${balanced} readings are balanced and ${unbalanced} readings require review.`;

    }

}


/* ==================================================
   SMART OPTIMIZER / SMART DAILY PLAN
================================================== */

function setupOptimizer() {

    const button =
        document.getElementById(
            "runOptimizerButton"
        );


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        runOptimizer
    );

}


async function runOptimizer() {

    const button =
        document.getElementById(
            "runOptimizerButton"
        );


    const result =
        document.getElementById(
            "optimizerResult"
        );


    const status =
        document.getElementById(
            "optimizerStatus"
        );


    if (!button) {
        return;
    }


    button.disabled = true;


    button.textContent =
        "Generating Daily Plan...";


    if (status) {

        status.textContent =
            "Generating the Smart Daily Plan from current renewable-energy conditions.";

    }


    try {

        /*
         * IMPORTANT:
         * The Smart Daily Plan button uses the dedicated
         * /daily-plan endpoint instead of /optimizer.
         *
         * The current date is explicitly supplied so that
         * the backend receives a valid scheduled date.
         */
        const data =
            await apiRequest(
                `/daily-plan?date=${encodeURIComponent(getTodayDate())}`
            );


        /*
         * Render the actual daily plan returned by
         * the backend.
         */
        renderDailyPlan(
            data
        );

        const plan =
            data.plan || {};

        const items =
            Array.isArray(plan.items)
                ? plan.items
                : [];

        /*
         * Also render the detailed recommendations table
         * and summary cards under #optimizerResult.
         */
        renderOptimizer({
            summary: plan.summary || {},
            recommendations: items.map(item => ({
                applianceName: item.applianceName,
                recommendedStart: item.start,
                recommendedEnd: item.end,
                renewableAvailable: item.renewableEnergyUsed,
                estimatedGridUsage: item.estimatedGridUsage,
                reason: item.status === "Recommended"
                    ? `Recommended operating window (${item.renewableCoverage || 0}% renewable coverage)`
                    : (item.status || "Planned load"),
                optimizationScore: item.optimizationScore ?? 0
            }))
        });

        /*
         * Keep the existing result panel behavior.
         */
        if (result) {

            result.style.display =
                "block";

            result.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        }


        if (status) {

            status.textContent =
                items.length > 0
                    ? `Smart Daily Plan generated successfully with ${items.length} recommendation${items.length === 1 ? "" : "s"}.`
                    : "Smart Daily Plan generated, but no recommendations are currently available.";

        }


    } catch (error) {

        console.error(
            "Smart Daily Plan error:",
            error
        );


        if (status) {

            status.textContent =
                `Unable to generate the Smart Daily Plan: ${error.message}`;

        }

    } finally {

        button.disabled = false;


        button.textContent =
            "Generate Smart Daily Plan";

    }

}


/* ==================================================
   RENDER OPTIMIZER
================================================== */

function renderOptimizer(data) {

    const summary =
        data.summary || {};


    setText(
        "optimizedAnalyzed",
        summary.appliancesAnalyzed ??
        summary.totalAppliances ??
        "--"
    );


    setText(
        "optimizedCount",
        summary.appliancesOptimized ??
        "--"
    );


    const score =
        summary.averageOptimizationScore;


    setText(
        "optimizedScore",
        score !== undefined &&
        score !== null
            ? `${formatNumber(score)}/100`
            : "--"
    );


    const gridReduction =
        summary.estimatedGridReduction;


    setText(
        "optimizedGridReduction",
        gridReduction !== undefined &&
        gridReduction !== null
            ? `${formatNumber(gridReduction)} kWh`
            : "--"
    );


    renderOptimizerRecommendations(
        data.recommendations || []
    );


    const explanation =
        document.getElementById(
            "optimizerExplanation"
        );


    if (explanation) {

        explanation.textContent =
            `Recommendations consider renewable availability, appliance priority, operating duration and user-defined time constraints. The optimizer uses the latest available energy readings.`;

    }

}


/* ==================================================
   OPTIMIZER RECOMMENDATIONS
================================================== */

function renderOptimizerRecommendations(
    recommendations
) {

    const container =
        document.getElementById(
            "optimizerRecommendations"
        );


    if (!container) {
        return;
    }


    if (
        !recommendations ||
        recommendations.length === 0
    ) {

        container.innerHTML =
            `<div class="empty-state">
                No optimization recommendations are available for the current dataset.
            </div>`;

        return;

    }


    container.innerHTML =
        recommendations.map(
            item => {

                const score =
                    Number(
                        item.optimizationScore
                    ) || 0;


                let scoreClass =
                    "badge-info";


                if (score >= 80) {

                    scoreClass =
                        "badge-success";

                } else if (score < 50) {

                    scoreClass =
                        "badge-warning";

                }


                const start =
                    formatTime(
                        item.recommendedStart
                    );


                const end =
                    formatTime(
                        item.recommendedEnd
                    );


                const renewable =
                    Number(
                        item.renewableAvailable
                    ) || 0;


                const grid =
                    Number(
                        item.estimatedGridUsage
                    ) || 0;


                return `

                    <div class="data-row">

                        <div>

                            <div class="data-title">
                                ${escapeHtml(
                                    item.applianceName ||
                                    "Appliance"
                                )}
                            </div>


                            <div class="data-text">

                                Recommended period:
                                ${start}
                                -
                                ${end}

                                &nbsp;|&nbsp;

                                Renewable available:
                                ${formatNumber(renewable)}
                                kWh

                                &nbsp;|&nbsp;

                                Estimated grid usage:
                                ${formatNumber(grid)}
                                kWh

                            </div>


                            <div
                                class="data-text"
                                style="margin-top: 5px;"
                            >

                                ${escapeHtml(
                                    item.reason ||
                                    "Recommended based on renewable-energy availability."
                                )}

                            </div>

                        </div>


                        <div>

                            <span
                                class="badge ${scoreClass}"
                            >
                                ${formatNumber(score)}/100
                            </span>

                        </div>

                    </div>

                `;

            }
        ).join("");

}


/* ==================================================
   SCHEDULE MANAGEMENT
================================================== */

function setupScheduleManagement() {

    const saveButton =
        document.getElementById(
            "saveScheduleButton"
        );


    const clearButton =
        document.getElementById(
            "clearScheduleButton"
        );


    const form =
        document.getElementById(
            "scheduleForm"
        );


    if (saveButton) {

        saveButton.addEventListener(
            "click",
            saveSchedule
        );

    }


    if (clearButton) {

        clearButton.addEventListener(
            "click",
            clearScheduleForm
        );

    }


    if (form) {

        form.addEventListener(
            "submit",
            event => {

                event.preventDefault();

                saveSchedule();

            }
        );

    }

    const applianceSelect =
        document.getElementById(
            "scheduleAppliance"
        );

    if (applianceSelect) {

        applianceSelect.addEventListener(
            "change",
            () => {

                const opt =
                    applianceSelect.options[
                        applianceSelect.selectedIndex
                    ];

                if (!opt || !opt.value) return;

                const startVal =
                    opt.dataset.start
                        ? opt.dataset.start.slice(0, 5)
                        : "09:00";

                const duration =
                    Number(opt.dataset.duration) || 60;

                const startMins =
                    timeToMinutes(startVal);

                const endMins =
                    startMins + duration;

                const endVal =
                    minutesToTime(endMins).slice(0, 5);

                const startInput =
                    document.getElementById("scheduleStart");

                const endInput =
                    document.getElementById("scheduleEnd");

                if (startInput && !startInput.value) {
                    startInput.value = startVal;
                }

                if (endInput && !endInput.value) {
                    endInput.value = endVal;
                }

                setScheduleStatus(
                    `Selected ${opt.textContent} (${duration} min duration). Preferred operating window: ${startVal} - ${opt.dataset.end ? opt.dataset.end.slice(0, 5) : "18:00"}.`,
                    false
                );

            }
        );

    }

}


/* ==================================================
   SCHEDULE APPLIANCES
================================================== */

function populateScheduleAppliances(
    appliances
) {

    const select =
        document.getElementById(
            "scheduleAppliance"
        );


    if (!select) {
        return;
    }


    const currentValue =
        select.value;


    select.innerHTML =
        `<option value="">
            Select appliance
        </option>`;


    appliances.forEach(appliance => {

        const option =
            document.createElement("option");


        option.value =
            appliance.appliance_id ??
            appliance.id ??
            "";


        option.textContent =
            appliance.appliance_name;


        option.dataset.start =
            appliance.preferred_start ||
            "";


        option.dataset.end =
            appliance.preferred_end ||
            "";


        option.dataset.duration =
            appliance.duration_minutes ||
            "";


        select.appendChild(
            option
        );

    });


    if (currentValue) {

        select.value =
            currentValue;

    }

}


/* ==================================================
   DEFAULT SCHEDULE DATE
================================================== */

function setDefaultScheduleDate() {

    const input =
        document.getElementById(
            "scheduleDate"
        );


    if (!input) {
        return;
    }


    input.value =
        getTodayDate();

}


/* ==================================================
   TODAY'S DATE
================================================== */

function getTodayDate() {

    const today =
        new Date();


    const year =
        today.getFullYear();


    const month =
        String(
            today.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const day =
        String(
            today.getDate()
        ).padStart(
            2,
            "0"
        );


    return `${year}-${month}-${day}`;

}


/* ==================================================
   SCHEDULE SAVE
================================================== */

async function saveSchedule() {

    const appliance =
        document.getElementById(
            "scheduleAppliance"
        );


    const date =
        document.getElementById(
            "scheduleDate"
        );


    const start =
        document.getElementById(
            "scheduleStart"
        );


    const end =
        document.getElementById(
            "scheduleEnd"
        );


    const reason =
        document.getElementById(
            "scheduleReason"
        );


    const status =
        document.getElementById(
            "scheduleStatus"
        );


    const button =
        document.getElementById(
            "saveScheduleButton"
        );


    if (
        !appliance ||
        !date ||
        !start ||
        !end
    ) {
        return;
    }


    if (!appliance.value) {

        setScheduleStatus(
            "Please select an appliance.",
            true
        );

        return;

    }


    if (!date.value) {

        setScheduleStatus(
            "Please select a schedule date.",
            true
        );

        return;

    }


    if (!start.value || !end.value) {

        setScheduleStatus(
            "Please provide both start and end times.",
            true
        );

        return;

    }


    if (
        timeToMinutes(end.value) <=
        timeToMinutes(start.value)
    ) {

        setScheduleStatus(
            "End time must be later than start time.",
            true
        );

        return;

    }


    const payload = {

        appliance_id:
            Number(
                appliance.value
            ),

        scheduled_date:
            date.value,

        start_time:
            start.value,

        end_time:
            end.value,

        renewable_available:
            estimateRenewableAvailable(
                start.value,
                end.value,
                date.value
            ),

        reason:
            reason
                ? reason.value.trim()
                : ""

    };


    button.disabled = true;

    button.textContent =
        "Saving...";


    try {

        await apiRequest(
            "/schedules",
            {
                method: "POST",
                body: JSON.stringify(
                    payload
                )
            }
        );


        setScheduleStatus(
            "Schedule saved successfully.",
            false
        );


        clearScheduleTimeFields();


        await refreshScheduleRelatedData();


    } catch (error) {

        console.error(
            "Schedule save error:",
            error
        );


        setScheduleStatus(
            error.message ||
            "Unable to save schedule.",
            true
        );

    } finally {

        button.disabled = false;

        button.textContent =
            "Save Schedule";

    }

}


/* ==================================================
   SCHEDULE STATUS
================================================== */

function setScheduleStatus(
    message,
    isError
) {

    const status =
        document.getElementById(
            "scheduleStatus"
        );


    if (!status) {
        return;
    }


    status.textContent =
        message;


    status.style.color =
        isError
            ? "#b91c1c"
            : "#64748b";

}


/* ==================================================
   CLEAR SCHEDULE
================================================== */

function clearScheduleTimeFields() {

    const start =
        document.getElementById(
            "scheduleStart"
        );


    const end =
        document.getElementById(
            "scheduleEnd"
        );


    const reason =
        document.getElementById(
            "scheduleReason"
        );


    if (start) {
        start.value = "";
    }


    if (end) {
        end.value = "";
    }


    if (reason) {
        reason.value = "";
    }

}


function clearScheduleForm() {

    const appliance =
        document.getElementById(
            "scheduleAppliance"
        );


    if (appliance) {
        appliance.value = "";
    }


    setDefaultScheduleDate();

    clearScheduleTimeFields();


    setScheduleStatus(
        "Select an appliance and operating period to create a schedule.",
        false
    );

}


/* ==================================================
   SCHEDULE LIST
================================================== */

function ensureScheduleListContainer() {

    let container =
        document.getElementById(
            "scheduleList"
        );


    if (container) {
        return container;
    }


    const panelBody =
        document.querySelector(
            "#schedules .panel-body"
        );


    if (!panelBody) {
        return null;
    }


    container =
        document.createElement(
            "div"
        );

    container.id =
        "scheduleList";

    container.className =
        "data-list";

    container.style.marginTop =
        "18px";

    container.innerHTML =
        `<div class="loading-text">
            Loading schedules...
        </div>`;


    panelBody.appendChild(
        container
    );


    return container;

}


function renderScheduleList(
    data,
    errorMessage
) {

    const container =
        ensureScheduleListContainer();


    if (!container) {
        return;
    }


    if (errorMessage) {

        container.innerHTML =
            `<div class="data-error">
                ${escapeHtml(errorMessage)}
            </div>`;

        return;

    }


    if (
        !data ||
        data.length === 0
    ) {

        container.innerHTML =
            `<div class="empty-state">
                No appliance schedules have been saved yet.
            </div>`;

        return;

    }


    container.innerHTML =
        data.map(
            schedule => {

                const renewable =
                    Number(
                        schedule.renewable_available
                    );


                return `

                    <div class="data-row">

                        <div>

                            <div class="data-title">
                                ${escapeHtml(
                                    schedule.appliance_name ||
                                    "Appliance"
                                )}
                            </div>

                            <div class="data-text">

                                ${escapeHtml(
                                    formatScheduleDate(
                                        schedule.scheduled_date
                                    )
                                )}

                                &nbsp;|&nbsp;

                                ${formatTime(
                                    schedule.start_time
                                )}
                                -
                                ${formatTime(
                                    schedule.end_time
                                )}

                                ${
                                    schedule.reason
                                        ? `&nbsp;|&nbsp; ${escapeHtml(schedule.reason)}`
                                        : ""
                                }

                            </div>

                        </div>


                        <div>

                            <span class="badge badge-info">
                                ${
                                    Number.isNaN(renewable)
                                        ? "--"
                                        : `${formatNumber(renewable)} kWh`
                                }
                            </span>

                        </div>

                    </div>

                `;

            }
        ).join("");

}


/* ==================================================
   REFRESH SCHEDULE-RELATED DATA
================================================== */

async function refreshScheduleRelatedData() {

    try {

        const summaryResponse =
            await apiRequest(
                "/dashboard-summary"
            );


        const summary =
            summaryResponse.summary || {};


        setText(
            "totalSchedules",
            summary.totalSchedules ??
            0
        );


    } catch (error) {

        console.warn(
            "Unable to refresh schedule count:",
            error
        );

    }


    try {

        const schedulesResponse =
            await apiRequest(
                "/schedules"
            );


        scheduleData =
            schedulesResponse.data ||
            [];


        renderScheduleList(
            scheduleData
        );


    } catch (error) {

        console.error(
            "Unable to refresh schedules:",
            error
        );


        renderScheduleList(
            [],
            error.message ||
            "Unable to load schedules."
        );

    }


    try {

        const dailyPlanResponse =
            await apiRequest(
                `/daily-plan?date=${encodeURIComponent(getTodayDate())}`
            );


        renderDailyPlan(
            dailyPlanResponse
        );


    } catch (error) {

        console.warn(
            "Unable to refresh daily plan:",
            error
        );


        renderDailyPlan(
            null,
            error.message ||
            "Unable to refresh the Smart Daily Plan."
        );

    }

}


/* ==================================================
   DASHBOARD ERROR
================================================== */

function showDashboardError(
    message
) {

    const notice =
        document.getElementById(
            "systemNoticeText"
        );


    if (notice) {

        notice.textContent =
            `Unable to load dashboard data: ${message}`;

    }


    const quality =
        document.getElementById(
            "dataQualityDescription"
        );


    if (quality) {

        quality.textContent =
            "Dashboard data could not be retrieved. Check that the Urja Mitra backend server is running.";

    }


    const qualityBadge =
        document.getElementById(
            "dataQualityBadge"
        );


    if (qualityBadge) {

        qualityBadge.textContent =
            "Unavailable";

        qualityBadge.className =
            "badge badge-danger";

    }

}


/* ==================================================
   DOM HELPERS
================================================== */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (!element) {
        return;
    }


    element.textContent =
        value;

}


function setWidth(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (!element) {
        return;
    }


    const width =
        Math.min(
            100,
            Math.max(
                0,
                Number(value) || 0
            )
        );


    element.style.width =
        `${width}%`;

}


function setLastUpdated(
    text
) {

    setText(
        "lastUpdated",
        text
    );

}


/* ==================================================
   FORMATTING
================================================== */

function formatNumber(
    value
) {

    const number =
        Number(value);


    if (
        Number.isNaN(number)
    ) {

        return "--";

    }


    return number.toFixed(2);

}


function safePercentage(
    value
) {

    const number =
        Number(value);


    if (
        Number.isNaN(number)
    ) {

        return 0;

    }


    return Math.min(
        100,
        Math.max(
            0,
            number
        )
    );

}


function formatTime(
    value
) {

    if (!value) {
        return "--";
    }


    const parts =
        String(value)
            .split(":");


    if (
        parts.length < 2
    ) {

        return value;

    }


    let hour =
        Number(
            parts[0]
        );


    const minute =
        parts[1];


    if (
        Number.isNaN(hour)
    ) {

        return value;

    }


    const suffix =
        hour >= 12
            ? "PM"
            : "AM";


    hour =
        hour % 12;


    if (
        hour === 0
    ) {

        hour = 12;

    }


    return `${hour}:${minute} ${suffix}`;

}


function formatDateTime(
    date
) {

    if (
        !(date instanceof Date) ||
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "--";

    }


    return date.toLocaleString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
        }
    );

}


function timeToMinutes(
    value
) {

    if (!value) {
        return -1;
    }


    const parts =
        String(value)
            .split(":");


    if (
        parts.length < 2
    ) {

        return -1;

    }


    const hour =
        Number(parts[0]);


    const minute =
        Number(parts[1]);


    if (
        Number.isNaN(hour) ||
        Number.isNaN(minute)
    ) {

        return -1;

    }


    return (
        hour * 60 +
        minute
    );

}


function normalizeDateString(
    value
) {

    if (!value) {
        return "";
    }


    const text =
        String(value);


    const match =
        text.match(
            /^(\d{4}-\d{2}-\d{2})/
        );


    if (match) {
        return match[1];
    }


    return "";

}


function formatScheduleDate(
    value
) {

    const dateKey =
        normalizeDateString(
            value
        );


    if (!dateKey) {
        return value
            ? String(value)
            : "--";
    }


    const parts =
        dateKey.split("-");


    if (
        parts.length !== 3
    ) {

        return dateKey;

    }


    const date =
        new Date(
            Number(parts[0]),
            Number(parts[1]) - 1,
            Number(parts[2])
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return dateKey;

    }


    return date.toLocaleDateString(
        "en-IN",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );

}


function estimateRenewableAvailable(
    startTime,
    endTime,
    scheduledDate
) {

    const startMinutes =
        timeToMinutes(
            startTime
        );


    const endMinutes =
        timeToMinutes(
            endTime
        );


    const dateKey =
        normalizeDateString(
            scheduledDate
        );


    const rows =
        Array.isArray(energyData)
            ? energyData
            : [];


    const datedRows =
        dateKey
            ? rows.filter(
                row =>
                    normalizeDateString(
                        row.reading_date
                    ) ===
                    dateKey
            )
            : [];


    const sourceRows =
        datedRows.length
            ? datedRows
            : rows;


    const windowRows =
        sourceRows.filter(
            row => {

                const minutes =
                    timeToMinutes(
                        row.reading_time
                    );


                if (
                    minutes < 0 ||
                    startMinutes < 0 ||
                    endMinutes < 0
                ) {

                    return false;

                }


                return (
                    minutes >=
                    startMinutes &&
                    minutes <
                    endMinutes
                );

            }
        );


    let selectedRows =
        windowRows;


    if (
        selectedRows.length === 0 &&
        sourceRows.length > 0 &&
        startMinutes >= 0
    ) {

        let closest =
            sourceRows[0];


        let closestDiff =
            Math.abs(
                timeToMinutes(
                    closest.reading_time
                ) -
                startMinutes
            );


        sourceRows.forEach(
            row => {

                const minutes =
                    timeToMinutes(
                        row.reading_time
                    );


                if (minutes < 0) {
                    return;
                }


                const diff =
                    Math.abs(
                        minutes -
                        startMinutes
                    );


                if (
                    diff <
                    closestDiff
                ) {

                    closest =
                        row;

                    closestDiff =
                        diff;

                }

            }
        );


        selectedRows = [
            closest
        ];

    }


    const total =
        selectedRows.reduce(
            (sum, row) => {

                const fromMetrics =
                    row.energyMetrics &&
                    row.energyMetrics.renewableGeneration;


                const generation =
                    fromMetrics !==
                    undefined &&
                    fromMetrics !==
                    null
                        ? Number(
                            fromMetrics
                        )
                        : Number(
                            row.renewable_generation
                        );


                return (
                    sum +
                    (
                        Number.isNaN(
                            generation
                        )
                            ? 0
                            : generation
                    )
                );

            },
            0
        );


    return Number(
        total.toFixed(2)
    );

}


/* ==================================================
   HTML SAFETY
================================================== */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}