const https = require('https');
const http = require('http');

/**
 * ML Communication Service
 *
 * Sends the 9 student performance features (matching the training dataset) to
 * the ML model API and returns the predicted performance label.
 *
 * Dataset features → ML payload:
 * ┌──────────────────────────┬──────────────┬───────────┐
 * │ Dataset Column           │ JS field     │ Range     │
 * ├──────────────────────────┼──────────────┼───────────┤
 * │ GPA                      │ gpa          │ 0.0–4.0   │
 * │ Course_Scores            │ courseScores │ 0–100     │
 * │ Aptitude_Score           │ aptitudeScore│ 0–100     │
 * │ Attendance               │ attendance   │ 0–100 (%) │
 * │ Supervisor_Evaluation    │ supervisorEvaluation │ 0–10 │
 * │ Report_Quality           │ reportQuality│ 0–10      │
 * │ Activity_Log_Frequency   │ activityLogFrequency │ 0–29 │
 * │ Completion_Time          │ completionTime │ 1–7     │
 * │ Feedback_Rating          │ feedbackRating │ 1–5     │
 * └──────────────────────────┴──────────────┴───────────┘
 *
 * Performance_Score label mapping (from dataset distribution):
 *   >= 85  → Excellent  (14.2%)
 *   70–84  → Good       (30.6%)
 *   55–69  → Average    (34.0%)
 *   40–54  → Fair       (18.0%)
 *   < 40   → Poor       ( 3.1%)
 *
 * Expected ML API request body (Python/snake_case):
 * {
 *   "GPA": 2.5,
 *   "Course_Scores": 75.3,
 *   "Aptitude_Score": 60.0,
 *   "Attendance": 85.5,
 *   "Supervisor_Evaluation": 7.2,
 *   "Report_Quality": 6.8,
 *   "Activity_Log_Frequency": 12,
 *   "Completion_Time": 3,
 *   "Feedback_Rating": 4.1
 * }
 *
 * Expected ML API response:
 * {
 *   "prediction": "Good",
 *   "performance_score": 76.4,   // optional raw score
 *   "confidence": 0.87,           // optional
 *   "model_version": "1.0.0"      // optional
 * }
 *
 * Set ML_API_URL in your .env:
 *   ML_API_URL=http://localhost:5001/predict
 */

const VALID_PREDICTIONS = ['Excellent', 'Good', 'Average', 'Fair', 'Poor'];

/**
 * Maps JS camelCase fields → dataset column names (exactly as the ML model was trained on).
 */
const buildMLPayload = (features) => ({
  GPA: features.gpa,
  Course_Scores: features.courseScores,
  Aptitude_Score: features.aptitudeScore,
  Attendance: features.attendance,
  Supervisor_Evaluation: features.supervisorEvaluation,
  Report_Quality: features.reportQuality,
  Activity_Log_Frequency: features.activityLogFrequency,
  Completion_Time: features.completionTime,
  Feedback_Rating: features.feedbackRating,
});

/**
 * Converts a raw numeric performance score (0–100) to a label.
 * Matches the dataset distribution used during ML training.
 */
const scoreToLabel = (score) => {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Average';
  if (score >= 40) return 'Fair';
  return 'Poor';
};

/**
 * Pure Node.js HTTP/HTTPS GET — no axios dependency needed. Companion to
 * httpPost() below, used for read-only ML API endpoints (e.g. /test-evaluation).
 */
const httpGet = (url) => {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: 10000,
    };

    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`ML API responded with status ${res.statusCode}: ${data}`));
          }
        } catch {
          reject(new Error(`ML API returned invalid JSON: ${data}`));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('ML API timed out after 10s')); });
    req.on('error', (err) => reject(err));
    req.end();
  });
};

/**
 * Pure Node.js HTTP/HTTPS POST — no axios dependency needed.
 */
const httpPost = (url, payload) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    };

    const lib = isHttps ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`ML API responded with status ${res.statusCode}: ${data}`));
          }
        } catch {
          reject(new Error(`ML API returned invalid JSON: ${data}`));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('ML API timed out after 10s')); });
    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
};

/**
 * Sends the 9 features to the ML model and returns the prediction.
 * Falls back to rule-based scoring if ML_API_URL is not set or the call fails.
 */
const predictPerformance = async (features) => {
  const mlUrl = process.env.ML_API_URL;

  if (!mlUrl) {
    console.warn('[ML Service] ML_API_URL not set — using rule-based fallback.');
    return ruleBasedFallback(features);
  }

  try {
    const payload = buildMLPayload(features);
    console.log(`[ML Service] Sending to ${mlUrl}:`, payload);

    const response = await httpPost(mlUrl, payload);
    console.log('[ML Service] Response:', response);

    // Accept label directly, or derive from a numeric score
    let result;
    if (response.prediction || response.result || response.label) {
      const raw = response.prediction || response.result || response.label;
      result = VALID_PREDICTIONS.find((v) => v.toLowerCase() === raw.toLowerCase());
      if (!result) throw new Error(`Unknown prediction label: "${raw}"`);
    } else if (response.performance_score !== undefined) {
      result = scoreToLabel(response.performance_score);
    } else {
      throw new Error('ML response did not contain a prediction or performance_score');
    }

    return {
      result,
      performanceScore: response.performance_score ?? null,
      confidence: response.confidence ?? null,
      modelVersion: response.model_version || response.modelVersion || '',
      rawResponse: response,
      error: '',
    };
  } catch (err) {
    console.error(`[ML Service] Prediction failed: ${err.message}. Using fallback.`);
    const fallback = ruleBasedFallback(features);
    return { ...fallback, error: err.message };
  }
};

/**
 * Rule-based fallback — weighted average that mirrors the dataset's feature importance.
 *
 * Weights derived from dataset analysis:
 *  - GPA, Course_Scores, Aptitude_Score are strong academic indicators
 *  - Supervisor_Evaluation and Feedback_Rating are strong performance signals
 *  - Completion_Time is inverted (lower time = better performance)
 *
 * All features are normalised to 0–100 before weighting.
 */
const ruleBasedFallback = (features) => {
  const gpaScaled        = (features.gpa / 4.0) * 100;
  const courseScores     = features.courseScores;                      // already 0–100
  const aptitudeScore    = features.aptitudeScore;                     // already 0–100
  const attendance       = features.attendance;                        // already 0–100
  const supervisorEval   = (features.supervisorEvaluation / 10) * 100;
  const reportQuality    = (features.reportQuality / 10) * 100;
  const activityLog      = (features.activityLogFrequency / 29) * 100;
  const completionTime   = ((7 - features.completionTime) / 6) * 100; // inverted: lower=better
  const feedbackRating   = ((features.feedbackRating - 1) / 4) * 100;

  const weights = {
    gpa: 0.15,
    courseScores: 0.15,
    aptitudeScore: 0.12,
    attendance: 0.10,
    supervisorEval: 0.15,
    reportQuality: 0.10,
    activityLog: 0.08,
    completionTime: 0.08,
    feedbackRating: 0.07,
  };

  const score =
    gpaScaled      * weights.gpa +
    courseScores   * weights.courseScores +
    aptitudeScore  * weights.aptitudeScore +
    attendance     * weights.attendance +
    supervisorEval * weights.supervisorEval +
    reportQuality  * weights.reportQuality +
    activityLog    * weights.activityLog +
    completionTime * weights.completionTime +
    feedbackRating * weights.feedbackRating;

  return {
    result: scoreToLabel(score),
    performanceScore: parseFloat(score.toFixed(2)),
    confidence: null,
    modelVersion: 'rule-based-fallback-v2',
    rawResponse: {
      score: parseFloat(score.toFixed(2)),
      method: 'weighted_average',
      breakdown: {
        gpa: parseFloat((gpaScaled * weights.gpa).toFixed(2)),
        courseScores: parseFloat((courseScores * weights.courseScores).toFixed(2)),
        aptitudeScore: parseFloat((aptitudeScore * weights.aptitudeScore).toFixed(2)),
        attendance: parseFloat((attendance * weights.attendance).toFixed(2)),
        supervisorEval: parseFloat((supervisorEval * weights.supervisorEval).toFixed(2)),
        reportQuality: parseFloat((reportQuality * weights.reportQuality).toFixed(2)),
        activityLog: parseFloat((activityLog * weights.activityLog).toFixed(2)),
        completionTime: parseFloat((completionTime * weights.completionTime).toFixed(2)),
        feedbackRating: parseFloat((feedbackRating * weights.feedbackRating).toFixed(2)),
      },
    },
    error: '',
  };
};

/**
 * Sends a large batch of records (each with the 9 features PLUS a known
 * "actual" label) to the ML API's /evaluate endpoint, and returns
 * accuracy / confusion-matrix / per-class metrics. Used for the admin
 * "training dataset performance" dashboard -- NOT part of the per-student
 * prediction flow.
 *
 * Derives the /evaluate URL from ML_API_URL (which points at /predict) by
 * swapping the path, so only one env var is needed.
 *
 * Unlike predictPerformance(), this has NO rule-based fallback -- if the ML
 * API is unreachable, it throws, since there's no meaningful way to
 * "fall back" for an accuracy report.
 */
const evaluateDataset = async (records) => {
  const mlUrl = process.env.ML_API_URL;
  if (!mlUrl) {
    throw new Error('ML_API_URL is not set -- cannot evaluate the dataset.');
  }

  const evaluateUrl = mlUrl.replace(/\/predict\/?$/, '/evaluate');
  const response = await httpPost(evaluateUrl, { records });

  if (!response.success) {
    throw new Error(response.error || 'ML API evaluation failed');
  }

  return response;
};

/**
 * Fetches the model's genuine held-out test evaluation (accuracy, weighted
 * precision/recall/F1, ROC-AUC, confusion matrix) from the ML API's
 * /test-evaluation endpoint. This is the model's real accuracy, computed on
 * data withheld from training (~63%) -- unlike evaluateDataset() above,
 * which re-scores the model against the FULL imported dataset (including
 * training rows) and therefore reads higher (~90%). The admin dashboard
 * should show this value as the headline "Accuracy" figure and present
 * evaluateDataset()'s result only as a secondary, clearly-labelled
 * live sanity check.
 *
 * Derives the /test-evaluation URL from ML_API_URL the same way
 * evaluateDataset() derives /evaluate.
 */
const getTestEvaluation = async () => {
  const mlUrl = process.env.ML_API_URL;
  if (!mlUrl) {
    throw new Error('ML_API_URL is not set -- cannot fetch the held-out test evaluation.');
  }

  const testEvalUrl = mlUrl.replace(/\/predict\/?$/, '/test-evaluation');
  return httpGet(testEvalUrl);
};

module.exports = { predictPerformance, evaluateDataset, getTestEvaluation, buildMLPayload, scoreToLabel, VALID_PREDICTIONS };
