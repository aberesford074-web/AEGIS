const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector(".primary-nav");
const header = document.querySelector(".site-header");
const heroImage = document.querySelector(".hero-visual img");
const revealItems = document.querySelectorAll(".reveal, .reveal-item");
const industryCards = document.querySelectorAll("[data-industry]");
const industryModal = document.querySelector(".industry-modal");
const modalTitle = document.querySelector("#modal-title");
const modalSummary = document.querySelector("#modal-summary");
const modalList = document.querySelector("#modal-list");
const modalMotion = document.querySelector(".modal-motion");
const modalMotionLabel = document.querySelector(".motion-industry-label");
const modalMotionCards = document.querySelectorAll(".motion-card");
const modalCloseButtons = document.querySelectorAll("[data-close-modal]");
const chatWidget = document.querySelector(".chat-widget");
const chatToggle = document.querySelector(".chat-toggle");
const chatClose = document.querySelector(".chat-close");
const chatMessages = document.querySelector(".chat-messages");
const chatForm = document.querySelector(".chat-form");
const chatInput = document.querySelector(".chat-input");
const chatProgressSteps = document.querySelectorAll(".chat-progress span");
const bookingModal = document.querySelector(".booking-modal");
const bookingCloseButtons = document.querySelectorAll("[data-close-booking]");
const tidyCalLinks = document.querySelectorAll("[data-open-tidycal]");
const workVideoCards = document.querySelectorAll("[data-work-video-card]");
const workVideos = document.querySelectorAll("[data-work-video]");
const workVideoDots = document.querySelectorAll(".work-showcase-dots span");
const workPrevButton = document.querySelector("[data-work-prev]");
const workNextButton = document.querySelector("[data-work-next]");
const LEAD_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbywCSMhLO6DTpgUWJLxzyEOt3Em-SVlDUgoP6s0OPlq2tVyhxYTq4zXM78RMxx4pgSAoA/exec";
const BOOKING_URL = "https://tidycal.com/aberesford074";
let tradesTouchStartY = 0;

if (document.body.classList.contains("trades-home")) {
  document.body.classList.remove("menu-open");

  const forcePageScroll = (deltaY) => {
    const maxScroll = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );
    const nextScroll = Math.min(maxScroll, Math.max(0, window.scrollY + deltaY));
    window.scrollTo({ top: nextScroll, left: 0, behavior: "auto" });
  };

  const handleForcedWheel = (event) => {
    if (Math.abs(event.deltaY) < 1 || document.querySelector(".booking-modal.is-open")) return;
    const multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? window.innerHeight : 1;
    event.preventDefault();
    forcePageScroll(event.deltaY * multiplier);
  };

  window.addEventListener("wheel", handleForcedWheel, { passive: false, capture: true });
  document.addEventListener("wheel", handleForcedWheel, { passive: false, capture: true });

  window.addEventListener("keydown", (event) => {
    const scrollKeys = {
      ArrowDown: 90,
      ArrowUp: -90,
      PageDown: window.innerHeight * 0.82,
      PageUp: window.innerHeight * -0.82,
      Space: window.innerHeight * 0.82
    };

    if (!(event.code in scrollKeys) || document.querySelector(".booking-modal.is-open")) return;
    event.preventDefault();
    forcePageScroll(scrollKeys[event.code]);
  }, { passive: false });

  document.addEventListener("touchstart", (event) => {
    tradesTouchStartY = event.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    const touchY = event.touches[0].clientY;
    const deltaY = tradesTouchStartY - touchY;

    if (Math.abs(deltaY) < 2) return;
    event.preventDefault();
    forcePageScroll(deltaY);
    tradesTouchStartY = touchY;
  }, { passive: false, capture: true });

  document.querySelectorAll("[data-scroll-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const direction = Number(button.getAttribute("data-scroll-page") || 1);
      forcePageScroll(direction * window.innerHeight * 0.82);
    });
  });
}

const openBookingModal = () => {
  if (!BOOKING_URL || !bookingModal) return;
  bookingModal.classList.add("is-open");
  bookingModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("menu-open");
};

const closeBookingModal = () => {
  if (!bookingModal) return;
  bookingModal.classList.remove("is-open");
  bookingModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("menu-open");
};

const openTidyCal = () => {
  if (!BOOKING_URL) return;
  const width = Math.min(980, window.screen.availWidth - 40);
  const height = Math.min(760, window.screen.availHeight - 40);
  const left = Math.max(0, (window.screen.availWidth - width) / 2);
  const top = Math.max(0, (window.screen.availHeight - height) / 2);
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  const opened = window.open(BOOKING_URL, "aegisTidyCalBooking", features);

  if (!opened) {
    window.location.href = BOOKING_URL;
    return;
  }

  opened.focus();
};

if (BOOKING_URL) {
  document.querySelectorAll("[data-booking-link]").forEach((link) => {
    link.href = BOOKING_URL;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openBookingModal();
    });
  });
}

bookingCloseButtons.forEach((button) => {
  button.addEventListener("click", closeBookingModal);
});

tidyCalLinks.forEach((link) => {
  link.href = BOOKING_URL;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openTidyCal();
  });
});

if (workVideoCards.length && workVideos.length) {
  let activeWorkVideo = 0;
  let workVideoStarted = false;

  const setActiveWorkVideo = (index, shouldPlay = true) => {
    activeWorkVideo = (index + workVideos.length) % workVideos.length;

    workVideoCards.forEach((card, cardIndex) => {
      const video = workVideos[cardIndex];
      const progress = card.querySelector(".work-video-progress");
      const isActive = cardIndex === activeWorkVideo;

      card.classList.toggle("is-active", isActive);
      if (progress) progress.style.width = "0%";

      if (!video) return;
      if (!isActive) {
        video.pause();
        video.currentTime = 0;
        return;
      }

      video.muted = true;
      if (shouldPlay) {
        video.play().catch(() => {});
      }
    });

    workVideoDots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === activeWorkVideo);
    });
  };

  const playWorkShowreel = () => {
    if (workVideoStarted) return;
    workVideoStarted = true;
    setActiveWorkVideo(activeWorkVideo);
  };

  workVideos.forEach((video, index) => {
    video.addEventListener("timeupdate", () => {
      const progress = workVideoCards[index]?.querySelector(".work-video-progress");
      if (!progress || !video.duration) return;
      progress.style.width = `${Math.min(100, (video.currentTime / video.duration) * 100)}%`;
    });

    video.addEventListener("ended", () => {
      setActiveWorkVideo(index + 1);
    });
  });

  workVideoCards.forEach((card, index) => {
    card.addEventListener("click", () => {
      workVideoStarted = true;
      setActiveWorkVideo(index);
    });
  });

  workPrevButton?.addEventListener("click", () => {
    workVideoStarted = true;
    setActiveWorkVideo(activeWorkVideo - 1);
  });

  workNextButton?.addEventListener("click", () => {
    workVideoStarted = true;
    setActiveWorkVideo(activeWorkVideo + 1);
  });

  if ("IntersectionObserver" in window) {
    const workVideoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            playWorkShowreel();
            workVideoObserver.disconnect();
          }
        });
      },
      { threshold: 0.35 }
    );

    workVideoObserver.observe(workVideoCards[0]);
  } else {
    playWorkShowreel();
  }

  setActiveWorkVideo(0, false);
}

const industryDetails = {
  trades: {
    title: "Trades & Field Services",
    summary: "Useful systems for trades and field teams that need faster response, cleaner job intake, and fewer missed follow-ups.",
    items: ["AI receptionist for missed calls", "Quote follow-up reminders", "Lead dashboard for new enquiries", "Customer appointment reminders", "Job handoff summaries"],
    motion: "trades",
    visual: {
      label: "Trades Automation",
      cards: [["Trigger", "New call or enquiry"], ["Automation", "Qualify + log lead"], ["Outcome", "Job booked"]],
    },
  },
  serviceOperations: {
    title: "Service Operations Teams",
    summary: "Workflows for service-led businesses that need faster enquiry response, cleaner job handoffs, and better follow-up.",
    items: ["Call and enquiry capture", "Quote follow-up", "Job update summaries", "Customer communication", "Manager visibility"],
    motion: "service-operations",
    visual: {
      label: "Service Operations Automation",
      cards: [["Trigger", "New enquiry"], ["Automation", "Reply + log job"], ["Outcome", "Follow-up ready"]],
    },
  },
  logistics: {
    title: "Logistics & Warehousing",
    summary: "Automation systems for teams managing requests, inboxes, suppliers, handoffs, reporting, and warehouse workflows.",
    items: ["Inbox triage", "Supplier chasing", "Request tracking", "Employee document organisation", "Weekly operational summaries"],
    motion: "logistics",
    visual: {
      label: "Logistics Automation",
      cards: [["Trigger", "New request"], ["Automation", "Route + update"], ["Outcome", "Report ready"]],
    },
  },
  construction: {
    title: "Construction Automation",
    summary: "Operational workflows for construction companies that need clearer updates, better scheduling, and fewer missed admin steps.",
    items: ["Quote follow-ups", "Project status updates", "Contractor scheduling", "Document collection", "Invoice and payment reminders"],
    motion: "construction",
    visual: {
      label: "Construction Automation",
      cards: [["Trigger", "Quote or site update"], ["Automation", "Notify team + log docs"], ["Outcome", "Invoice reminder queued"]],
    },
  },
  industrial: {
    title: "Operational Teams",
    summary: "A practical automation layer for businesses that need visibility, cleaner handoffs, and fewer manual tracking gaps.",
    items: ["Workflow dashboards", "Internal request tracking", "Automated reminders", "Team handoff summaries", "Operational reporting"],
    motion: "industrial",
    visual: {
      label: "Operations Automation",
      cards: [["Trigger", "Status update"], ["Automation", "Log + remind"], ["Outcome", "Team aligned"]],
    },
  },
  equipment: {
    title: "Operations CRM",
    summary: "Simple CRM systems for sales, quotes, customer follow-up, service requests, and daily operating visibility.",
    items: ["Quote follow-up", "Customer pipeline dashboards", "Service request tracking", "Task reminders", "Revenue reporting"],
    motion: "equipment",
    visual: {
      label: "CRM Automation",
      cards: [["Trigger", "New enquiry"], ["Automation", "Log + follow up"], ["Outcome", "Pipeline updated"]],
    },
  },
  fieldOperations: {
    title: "Field Operations Systems",
    summary: "Workflow tools for mobile teams that need cleaner job notes, scheduling, customer updates, and manager visibility.",
    items: ["Job note capture", "Scheduling reminders", "Customer update templates", "Manager summaries", "Urgent issue escalation"],
    motion: "field-operations",
    visual: {
      label: "Field Operations Automation",
      cards: [["Trigger", "Job update"], ["Automation", "Summarise + route"], ["Outcome", "Manager informed"]],
    },
  },
  localServices: {
    title: "Local Service Businesses",
    summary: "Simple systems for businesses that rely on fast replies, clean booking flows, and consistent customer communication.",
    items: ["Inbox summaries", "Website chatbot qualification", "Booking reminders", "Lead follow-up", "Simple monthly reporting"],
    motion: "local-services",
    visual: {
      label: "Local Service Automation",
      cards: [["Trigger", "Customer message"], ["Automation", "Summarise + respond"], ["Outcome", "Next action clear"]],
    },
  },
};

const chatState = {
  step: 0,
  problem: "",
  industry: "",
  tools: "",
  employees: "",
  bottleneck: "",
  name: "",
  email: "",
  phone: "",
  company: "",
};

const chatPrompts = [
  "What industry are you in?",
  "Describe what is slowing your business down. A good answer could be: we lose leads because nobody follows up quickly, or our team spends hours updating spreadsheets.",
  "What tools do you currently use? For example CRM, email, spreadsheets, booking software, website forms, WhatsApp, or accounting software.",
  "Roughly how many employees are in the business?",
  "Which part is most time-consuming or most frustrating for your team?",
  "Want a tailored workflow plan for your business? What is your name?",
  "What is your email address?",
  "What phone number should Aegis use if a quick call makes sense?",
  "Last one: what is your company name?",
];

const chatOptions = {
  0: ["Trades", "Field Services", "Logistics", "Construction", "Local Services", "Professional Services", "Other"],
  1: ["Lead follow-up", "Admin tasks", "Manual reporting", "Customer messages", "Bookings/reminders", "Other"],
  2: ["CRM", "Email", "Spreadsheets", "Booking software", "Website forms", "WhatsApp", "Other"],
  3: ["1-5", "6-20", "21-50", "51+", "Other"],
  4: ["Following up", "Updating systems", "Chasing documents", "Scheduling", "Reporting", "Other"],
};

const updateHeaderState = () => {
  if (!header) return;
  header.classList.toggle("is-scrolled", window.scrollY > 12);
};

updateHeaderState();
window.addEventListener("scroll", updateHeaderState, { passive: true });

if (heroImage && window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
  const parallax = {
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0,
    frame: null,
  };

  const renderHeroParallax = () => {
    parallax.currentX += (parallax.targetX - parallax.currentX) * 0.08;
    parallax.currentY += (parallax.targetY - parallax.currentY) * 0.08;

    heroImage.style.setProperty("--hero-shift-x", `${parallax.currentX.toFixed(2)}px`);
    heroImage.style.setProperty("--hero-shift-y", `${parallax.currentY.toFixed(2)}px`);

    if (Math.abs(parallax.targetX - parallax.currentX) > 0.05 || Math.abs(parallax.targetY - parallax.currentY) > 0.05) {
      parallax.frame = requestAnimationFrame(renderHeroParallax);
    } else {
      parallax.frame = null;
    }
  };

  const queueHeroParallax = () => {
    if (!parallax.frame) {
      parallax.frame = requestAnimationFrame(renderHeroParallax);
    }
  };

  window.addEventListener(
    "pointermove",
    (event) => {
      parallax.targetX = (event.clientX / window.innerWidth - 0.5) * -10;
      parallax.targetY = (event.clientY / window.innerHeight - 0.5) * -6;
      queueHeroParallax();
    },
    { passive: true }
  );
}

if (revealItems.length) {
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 }
    );

    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }
}

const openIndustryModal = (industryKey) => {
  const details = industryDetails[industryKey];
  if (!industryModal || !details || !modalTitle || !modalSummary || !modalList) return;

  modalTitle.textContent = details.title;
  modalSummary.textContent = details.summary;
  modalList.innerHTML = details.items.map((item) => `<li>${item}</li>`).join("");
  if (modalMotion) {
    modalMotion.className = `modal-motion motion-${details.motion}`;
  }
  if (modalMotionLabel && details.visual) {
    modalMotionLabel.textContent = details.visual.label;
  }
  if (modalMotionCards.length && details.visual) {
    modalMotionCards.forEach((card, index) => {
      const [title, subtitle] = details.visual.cards[index] || ["Step", "Automated"];
      card.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
    });
  }
  industryModal.classList.add("is-open");
  industryModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("menu-open");
};

const closeIndustryModal = () => {
  if (!industryModal) return;
  industryModal.classList.remove("is-open");
  industryModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("menu-open");
};

industryCards.forEach((card) => {
  card.addEventListener("click", (event) => {
    event.preventDefault();
    openIndustryModal(card.dataset.industry);
  });

  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openIndustryModal(card.dataset.industry);
    }
  });
});

modalCloseButtons.forEach((button) => {
  button.addEventListener("click", closeIndustryModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeIndustryModal();
    closeBookingModal();
  }
});

const addChatMessage = (message, sender = "bot") => {
  if (!chatMessages) return;
  const bubble = document.createElement("div");
  bubble.className = `chat-message ${sender}`;
  bubble.textContent = message;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

const updateChatProgress = () => {
  if (!chatProgressSteps.length) return;
  const activeIndex = Math.min(3, Math.floor(chatState.step / 3));

  chatProgressSteps.forEach((step, index) => {
    step.classList.toggle("is-active", index <= activeIndex);
  });
};

const addChatLink = (href, label) => {
  if (!chatMessages) return;
  const link = document.createElement("a");
  link.className = "chat-message bot chat-link";
  link.href = href;
  if (href.startsWith("http")) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  link.textContent = label;
  chatMessages.appendChild(link);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

const completeChat = () => {
  chatState.step = 9;
  chatInput?.setAttribute("disabled", "true");
  chatInput?.setAttribute("placeholder", "Details received. Book your audit above.");
  chatForm?.classList.add("is-complete");
  updateChatProgress();
};

const submitLead = async (payload) => {
  if (!LEAD_WEBHOOK_URL) {
    return { ok: false, reason: "missing-webhook" };
  }

  try {
    await fetch(LEAD_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
};

const addChatListMessage = (intro, items) => {
  if (!chatMessages) return;
  const bubble = document.createElement("div");
  const paragraph = document.createElement("p");
  const list = document.createElement("ul");

  bubble.className = "chat-message bot";
  paragraph.textContent = intro;
  bubble.appendChild(paragraph);

  items.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    list.appendChild(listItem);
  });

  bubble.appendChild(list);
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

const clearChatOptions = () => {
  document.querySelectorAll(".chat-options").forEach((group) => group.remove());
};

const showChatOptions = (step) => {
  if (!chatMessages || !chatOptions[step]) return;
  clearChatOptions();

  const options = document.createElement("div");
  options.className = "chat-options";

  chatOptions[step].forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = option === "Other" ? "chat-option is-other" : "chat-option";
    button.textContent = option;
    button.addEventListener("click", () => {
      if (option === "Other") {
        clearChatOptions();
        chatInput?.focus();
        addChatMessage("No problem. Type your answer in your own words.", "bot");
        return;
      }

      handleChatAnswer(option);
    });
    options.appendChild(button);
  });

  chatMessages.after(options);
};

const getAutomationSuggestion = () => {
  const text = `${chatState.problem} ${chatState.industry} ${chatState.tools} ${chatState.bottleneck}`.toLowerCase();

  if (text.includes("lead") || text.includes("crm") || text.includes("enquiry") || text.includes("inquiry")) {
    return {
      intro: "Based on that, you could automate:",
      items: ["Lead qualification", "Instant SMS/email follow-up", "CRM updates and tagging", "Sales reminders when nobody replies", "Appointment booking or callback scheduling"],
    };
  }

  if (text.includes("appointment") || text.includes("booking") || text.includes("reminder")) {
    return {
      intro: "Based on that, you could automate:",
      items: ["Booking confirmations", "Reminder messages", "No-show follow-ups", "Calendar updates", "Internal team notifications"],
    };
  }

  if (text.includes("order") || text.includes("shop") || text.includes("inventory") || text.includes("customer")) {
    return {
      intro: "Based on that, you could automate:",
      items: ["Customer order updates", "Inventory alerts", "Support ticket routing", "Refund or return workflows", "Review requests after delivery"],
    };
  }

  if (text.includes("spreadsheet") || text.includes("report") || text.includes("excel") || text.includes("sheet")) {
    return {
      intro: "Based on that, you could automate:",
      items: ["Data collection from your tools", "Spreadsheet updates", "Weekly performance reports", "Dashboard summaries", "Alerts when numbers need attention"],
    };
  }

  if (text.includes("invoice") || text.includes("payment") || text.includes("quote")) {
    return {
      intro: "Based on that, you could automate:",
      items: ["Quote follow-ups", "Invoice reminders", "Payment status updates", "Admin handoffs", "Simple reporting for overdue items"],
    };
  }

  return {
    intro: "Based on that, a sensible starting workflow could automate:",
    items: ["The trigger that starts the task", "The handoff to the right person or system", "Reminders when work is stuck", "Status updates for the team", "A weekly summary of what happened"],
  };
};

const getSuggestionText = () => getAutomationSuggestion().items.join(", ");

const openChat = () => {
  if (!chatWidget || !chatToggle || !chatMessages) return;
  chatWidget.classList.add("is-open");
  chatToggle.setAttribute("aria-expanded", "true");
  document.querySelector("#chat-panel")?.setAttribute("aria-hidden", "false");

  if (!chatMessages.children.length) {
    updateChatProgress();
    addChatMessage(chatPrompts[0]);
    showChatOptions(0);
  }
};

const closeChat = () => {
  if (!chatWidget || !chatToggle) return;
  chatWidget.classList.remove("is-open");
  chatToggle.setAttribute("aria-expanded", "false");
  document.querySelector("#chat-panel")?.setAttribute("aria-hidden", "true");
};

chatToggle?.addEventListener("click", openChat);
chatClose?.addEventListener("click", closeChat);

const handleChatAnswer = async (value) => {
  addChatMessage(value, "user");
  clearChatOptions();

  if (chatState.step === 0) {
    chatState.industry = value;
    chatState.step = 1;
    updateChatProgress();
    addChatMessage(chatPrompts[1]);
    showChatOptions(1);
    return;
  }

  if (chatState.step === 1) {
    chatState.problem = value;
    chatState.step = 2;
    updateChatProgress();
    addChatMessage(chatPrompts[2]);
    showChatOptions(2);
    return;
  }

  if (chatState.step === 2) {
    chatState.tools = value;
    chatState.step = 3;
    updateChatProgress();
    addChatMessage(chatPrompts[3]);
    showChatOptions(3);
    return;
  }

  if (chatState.step === 3) {
    chatState.employees = value;
    chatState.step = 4;
    updateChatProgress();
    addChatMessage(chatPrompts[4]);
    showChatOptions(4);
    return;
  }

  if (chatState.step === 4) {
    chatState.bottleneck = value;
    chatState.step = 5;
    updateChatProgress();
    const suggestion = getAutomationSuggestion();
    addChatListMessage(suggestion.intro, suggestion.items);
    addChatMessage("This is not a full system design yet, but it gives us a strong starting point.");
    addChatMessage(chatPrompts[5]);
    return;
  }

  if (chatState.step === 5) {
    chatState.name = value;
    chatState.step = 6;
    updateChatProgress();
    addChatMessage(chatPrompts[6]);
    return;
  }

  if (chatState.step === 6) {
    chatState.email = value;
    chatState.step = 7;
    updateChatProgress();
    addChatMessage(chatPrompts[7]);
    return;
  }

  if (chatState.step === 7) {
    chatState.phone = value;
    chatState.step = 8;
    updateChatProgress();
    addChatMessage(chatPrompts[8]);
    return;
  }

  if (chatState.step > 8) {
    addChatMessage("Your details are already captured. Use the booking popup to choose a time.");
    openBookingModal();
    return;
  }

  chatState.company = value;
  const leadPayload = {
    submittedAt: new Date().toISOString(),
    name: chatState.name,
    email: chatState.email,
    phone: chatState.phone,
    company: chatState.company,
    industry: chatState.industry,
    employees: chatState.employees,
    problem: chatState.problem,
    tools: chatState.tools,
    bottleneck: chatState.bottleneck,
    suggestedAutomations: getSuggestionText(),
    source: "Aegis website chatbot",
  };

  const result = await submitLead(leadPayload);

  if (result.ok) {
    addChatMessage("Thanks. Your details have been sent to Aegis. The next step is booking your Free Automation Audit.");
    completeChat();
    openBookingModal();
    return;
  }

  addChatMessage("Thanks. Your summary is ready. Use the button below to send it to Aegis, or connect the Google Sheets webhook to save it automatically.");

  const subject = encodeURIComponent("Automation enquiry from website chat");
  const body = encodeURIComponent(
    `Name:\n${chatState.name}\n\nEmail:\n${chatState.email}\n\nPhone:\n${chatState.phone}\n\nCompany:\n${chatState.company}\n\nIndustry:\n${chatState.industry}\n\nEmployees:\n${chatState.employees}\n\nProblem:\n${chatState.problem}\n\nTools involved:\n${chatState.tools}\n\nMost time-consuming part:\n${chatState.bottleneck}`
  );
  addChatLink(`mailto:hello@aegisautomations.com?subject=${subject}&body=${body}`, "Send enquiry summary");
  completeChat();
  openBookingModal();
};

chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = chatInput?.value.trim();
  if (!value || !chatInput) return;

  chatInput.value = "";
  handleChatAnswer(value);
});

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isOpen));
    nav.classList.toggle("is-open", !isOpen);
    document.body.classList.toggle("menu-open", !isOpen);
  });

  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
      document.body.classList.remove("menu-open");
    }
  });
}
