// api/src/config/surveyQuestions.js
//
// Static catalog of customer satisfaction survey questions, keyed by phase.
// SINGLE SOURCE OF TRUTH: the public survey API resolves questions from here
// and sends them to the frontend, so question text lives in exactly one place.
//
// questionKey values are STABLE contracts - stored SurveyAnswer rows and all
// reporting reference them. Never renumber or repurpose a key; append only.
//
// Stage -> phase firing is driven by STAGE_TO_PHASE, aligned to state.js STAGES.

export const SURVEY_PHASES = {
  MANUFACTURING: "MANUFACTURING",
  CONTAINER_AT_SEA: "CONTAINER_AT_SEA",
  COMPLETION: "COMPLETION",
};

// Canonical pipeline stage (state.js) -> survey phase it fires.
// Order-level: fires when the FIRST item of an order reaches the stage.
export const STAGE_TO_PHASE = {
  MANUFACTURING: SURVEY_PHASES.MANUFACTURING,
  AT_SEA: SURVEY_PHASES.CONTAINER_AT_SEA,
  COMPLETED: SURVEY_PHASES.COMPLETION,
};

export const RATING_SCALE = {
  min: 1,
  max: 5,
  labels: {
    1: "Very Dissatisfied",
    2: "Dissatisfied",
    3: "Neutral",
    4: "Satisfied",
    5: "Very Satisfied",
  },
  // Any rating at or below this flags the survey for management review.
  flagThreshold: 3,
};

// Question types:
//   "rating" - 1-5 star scale, optional comment
//   "choice" - single select from options, optional comment
//   "text"   - free-text only
// Question roles (used by surveyService so logic never hardcodes keys):
//   "contact"     - a REQUEST_CONTACT option creates a follow-up
//   "testimonial" - option carries testimonialValue (YES|MAYBE|NO)
//   "feedback"    - open-ended final feedback

const CONTACT_OPTIONS = (noLabel) => [
  { value: "NO_CONTACT", label: noLabel },
  {
    value: "REQUEST_CONTACT",
    label: "Yes, I would like someone from Stealth Machine Tools to contact me.",
    triggersContact: true,
  },
];

export const SURVEY_DEFINITIONS = {
  [SURVEY_PHASES.MANUFACTURING]: {
    phase: SURVEY_PHASES.MANUFACTURING,
    title: "Customer Experience Check-In",
    questions: [
      { key: "mfg_q1", type: "rating", commentEnabled: true,
        text: "How would you rate your experience working with your sales representative so far?" },
      { key: "mfg_q2", type: "rating", commentEnabled: true,
        text: "How satisfied are you with the communication you have received regarding your machine, project timeline, and next steps?" },
      { key: "mfg_q3", type: "rating", commentEnabled: true,
        text: "Have all of your questions been answered completely and in a timely manner?" },
      { key: "mfg_q4", type: "rating", commentEnabled: true,
        text: "Based on the information provided during the sales process, how confident are you that the selected machine is the right fit for your operation?" },
      { key: "mfg_q5", type: "choice", role: "contact", commentEnabled: true,
        text: "Do you currently have any unanswered questions, concerns, or feedback that you would like our team to address?",
        options: CONTACT_OPTIONS("No, everything has been addressed.") },
    ],
  },

  [SURVEY_PHASES.CONTAINER_AT_SEA]: {
    phase: SURVEY_PHASES.CONTAINER_AT_SEA,
    title: "Customer Experience Check-In",
    questions: [
      { key: "sea_q1", type: "rating", commentEnabled: true,
        text: "How satisfied are you with the communication and updates you have received regarding your machine's progress and shipment?" },
      { key: "sea_q2", type: "rating", commentEnabled: true,
        text: "Have the photos, videos, and testing documentation provided helped increase your confidence in your machine and its progress?" },
      { key: "sea_q3", type: "rating", commentEnabled: true,
        text: "How clear is your understanding of the remaining steps before your machine is delivered, installed, and ready for production?" },
      { key: "sea_q4", type: "rating", commentEnabled: true,
        text: "Based on your experience so far, do you feel that Stealth Machine Tools has delivered on the commitments and expectations established during the sales process?" },
      { key: "sea_q5", type: "choice", role: "contact", commentEnabled: true,
        text: "Do you have any questions, concerns, or requests that you would like our team to address before your machine arrives?",
        options: CONTACT_OPTIONS("No, everything is going well.") },
    ],
  },

  [SURVEY_PHASES.COMPLETION]: {
    phase: SURVEY_PHASES.COMPLETION,
    title: "Customer Experience Review",
    questions: [
      { key: "comp_q1", type: "rating", commentEnabled: true,
        text: "How would you rate your overall experience with Stealth Machine Tools from purchase through installation?" },
      { key: "comp_q2", type: "rating", commentEnabled: true,
        text: "How satisfied are you with the performance of your machine compared to your expectations?" },
      { key: "comp_q3", type: "rating", commentEnabled: true,
        text: "How would you rate the delivery, installation, training, and support provided by our team?" },
      { key: "comp_q4", type: "rating", commentEnabled: true,
        text: "How likely are you to purchase another machine from Stealth Machine Tools in the future?" },
      { key: "comp_q5", type: "rating", commentEnabled: true,
        text: "How likely are you to recommend Stealth Machine Tools to a friend, colleague, or another business owner?" },
      { key: "comp_q6", type: "text", role: "feedback", commentEnabled: false,
        text: "What did we do well, and what could we have done better throughout your experience?" },
      { key: "comp_q7", type: "choice", role: "testimonial", commentEnabled: true,
        text: "Would you be willing to provide a testimonial, case study, photo, or video of your machine in operation?",
        options: [
          { value: "YES", label: "Yes", testimonialValue: "YES" },
          { value: "MAYBE", label: "Maybe", testimonialValue: "MAYBE" },
          { value: "NO", label: "Not at this time", testimonialValue: "NO" },
        ] },
    ],
  },
};

export function getSurveyDefinition(phase) {
  return SURVEY_DEFINITIONS[phase] || null;
}

export function getQuestionsForPhase(phase) {
  const def = SURVEY_DEFINITIONS[phase];
  return def ? def.questions : [];
}

export function isValidRating(n) {
  return Number.isInteger(n) && n >= RATING_SCALE.min && n <= RATING_SCALE.max;
}

// Build a fast lookup of key -> question for a phase (used on submit validation).
export function questionMap(phase) {
  const map = new Map();
  for (const q of getQuestionsForPhase(phase)) map.set(q.key, q);
  return map;
}
