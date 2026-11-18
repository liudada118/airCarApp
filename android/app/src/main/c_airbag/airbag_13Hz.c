#include "airbag_13Hz.h"
#include "rtwtypes.h"
#include <string.h>
#include "rt_nonfinite.h"
#include <math.h>

DW_airbag_13Hz_T airbag_13Hz_DW;
ExtU_airbag_13Hz_T airbag_13Hz_U;
ExtY_airbag_13Hz_T airbag_13Hz_Y;
static RT_MODEL_airbag_13Hz_T airbag_13Hz_M_;
RT_MODEL_airbag_13Hz_T *const airbag_13Hz_M =
  &airbag_13Hz_M_;
static void Zairb_calculatePressureFeatures(const real32_T matrixIn[56],
  real32_T threshold, real32_T *originalSum, real32_T *filteredSum);
static real32_T airbag_13Hz_sum(const real32_T x_data[], const
  int32_T *x_size);
static real32_T airbag_13Hz_mean(const real32_T x_data[], const
  int32_T *x_size);
static int32_T Zairbag_1_combineVectorElements(const boolean_T x_data[], const
  int32_T *x_size);
static real32_T Zairbag_13Hz_Final__directionOf(real32_T b_value);
static boolean_T Zairbag_13Hz__allFinitePositive(const real32_T values[8]);
static boolean_T airbag_13Hz_any(const boolean_T x[3]);
static void Zairbag_13Hz_Fin_makeThresholds(real32_T lumbarRatio, real32_T
  wingRatio, real32_T leftLegRatio, real32_T rightLegRatio, real32_T thresholds
  [8]);
static void Zairbag_13Hz_applyAdaptiveGears(real32_T frame[55], real32_T
  leftWingGear, real32_T rightWingGear, real32_T lumbarGear, real32_T
  leftLegGear, real32_T rightLegGear);
static void Zairb_calculatePressureFeatures(const real32_T matrixIn[56],
  real32_T threshold, real32_T *originalSum, real32_T *filteredSum)
{
  int32_T b;
  int32_T b_nz;
  int32_T count;
  int32_T i;
  int32_T k;
  int32_T nz;
  real32_T y;
  int8_T b_vlen_tmp_data[56];
  int8_T pointsC[56];
  int8_T pointsR[56];
  int8_T stackC[56];
  int8_T stackR[56];
  int8_T vlen_tmp_data[56];
  boolean_T filteredMask[56];
  boolean_T originalMask[56];
  boolean_T visited[56];
  static const int8_T d[8] = { -1, -1, -1, 0, 0, 1, 1, 1 };

  static const int8_T e[8] = { -1, 0, 1, -1, 1, -1, 0, 1 };

  for (b = 0; b < 56; b++) {
    originalMask[b] = (matrixIn[b] >= threshold);
    visited[b] = false;
    filteredMask[b] = false;
  }

  for (b_nz = 0; b_nz < 7; b_nz++) {
    for (nz = 0; nz < 8; nz++) {
      b = 7 * nz + b_nz;
      if (originalMask[b] && (!visited[b])) {
        for (i = 0; i < 56; i++) {
          stackR[i] = 0;
          stackC[i] = 0;
          pointsR[i] = 0;
          pointsC[i] = 0;
        }

        i = 0;
        count = 0;
        stackR[0] = (int8_T)(b_nz + 1);
        stackC[0] = (int8_T)(nz + 1);
        visited[b] = true;
        while (i + 1 > 0) {
          int32_T cc;
          int32_T cr;
          cr = stackR[i];
          cc = stackC[i];
          i--;
          if (count > 2147483646) {
            count = MAX_int32_T;
          } else {
            count++;
          }

          pointsR[count - 1] = (int8_T)cr;
          pointsC[count - 1] = (int8_T)cc;
          for (k = 0; k < 8; k++) {
            int32_T nc;
            int32_T nr;
            nr = cr + d[k];
            nc = cc + e[k];
            if ((nr >= 1) && (nr <= 7) && (nc >= 1) && (nc <= 8) &&
                originalMask[((nc - 1) * 7 + nr) - 1] && (!visited[((nc - 1) * 7
                  + nr) - 1])) {
              int32_T qY;
              visited[(nr + 7 * (nc - 1)) - 1] = true;
              if (i + 1 > 2147483646) {
                qY = MAX_int32_T;
                b = MAX_int32_T;
              } else {
                qY = i + 2;
                b = i + 2;
              }

              i = b - 1;
              stackR[qY - 1] = (int8_T)nr;
              stackC[qY - 1] = (int8_T)nc;
            }
          }
        }

        if (count >= 5) {
          b = (uint8_T)count;
          for (i = 0; i < b; i++) {
            filteredMask[(pointsR[i] + 7 * (pointsC[i] - 1)) - 1] = true;
          }
        }
      }
    }
  }

  nz = (matrixIn[0] >= threshold);
  b_nz = filteredMask[0];
  for (b = 0; b < 55; b++) {
    nz += (matrixIn[b + 1] >= threshold);
    b_nz += filteredMask[b + 1];
  }

  if (nz > 0) {
    nz = 0;
    for (i = 0; i < 56; i++) {
      if (originalMask[i]) {
        nz++;
      }
    }

    count = nz;
    nz = 0;
    for (i = 0; i < 56; i++) {
      if (originalMask[i]) {
        vlen_tmp_data[nz] = (int8_T)i;
        nz++;
      }
    }

    if (count == 0) {
      y = 0.0F;
    } else {
      y = matrixIn[vlen_tmp_data[0]];
      for (b = 2; b <= count; b++) {
        y += matrixIn[vlen_tmp_data[b - 1]];
      }
    }

    *originalSum = y * 1.30434787F;
  } else {
    *originalSum = 0.0F;
  }

  if (b_nz > 0) {
    nz = 0;
    for (i = 0; i < 56; i++) {
      if (filteredMask[i]) {
        nz++;
      }
    }

    b = nz;
    nz = 0;
    for (i = 0; i < 56; i++) {
      if (filteredMask[i]) {
        b_vlen_tmp_data[nz] = (int8_T)i;
        nz++;
      }
    }

    if (b == 0) {
      y = 0.0F;
    } else {
      y = matrixIn[b_vlen_tmp_data[0]];
      for (nz = 2; nz <= b; nz++) {
        y += matrixIn[b_vlen_tmp_data[nz - 1]];
      }
    }

    *filteredSum = y * 1.30434787F;
  } else {
    *filteredSum = 0.0F;
  }
}

static real32_T airbag_13Hz_sum(const real32_T x_data[], const
  int32_T *x_size)
{
  int32_T k;
  int32_T vlen;
  real32_T y;
  vlen = *x_size;
  if (*x_size == 0) {
    y = 0.0F;
  } else {
    y = x_data[0];
    for (k = 2; k <= vlen; k++) {
      y += x_data[k - 1];
    }
  }

  return y;
}

static real32_T airbag_13Hz_mean(const real32_T x_data[], const
  int32_T *x_size)
{
  int32_T k;
  int32_T vlen;
  real32_T accumulatedData;
  vlen = *x_size;
  if (*x_size == 0) {
    accumulatedData = 0.0F;
  } else {
    accumulatedData = x_data[0];
    for (k = 2; k <= vlen; k++) {
      accumulatedData += x_data[k - 1];
    }
  }

  return accumulatedData / (real32_T)*x_size;
}

static int32_T Zairbag_1_combineVectorElements(const boolean_T x_data[], const
  int32_T *x_size)
{
  int32_T k;
  int32_T vlen;
  int32_T y;
  vlen = *x_size;
  if (*x_size == 0) {
    y = 0;
  } else {
    y = x_data[0];
    for (k = 2; k <= vlen; k++) {
      y += x_data[1];
    }
  }

  return y;
}

static real32_T Zairbag_13Hz_Final__directionOf(real32_T b_value)
{
  real32_T direction;
  if (rtIsInfF(b_value) || rtIsNaNF(b_value)) {
    direction = 0.0F;
  } else if (b_value > 0.0F) {
    direction = 1.0F;
  } else if (b_value < 0.0F) {
    direction = -1.0F;
  } else {
    direction = 0.0F;
  }

  return direction;
}

static boolean_T Zairbag_13Hz__allFinitePositive(const real32_T values[8])
{
  int32_T k;
  boolean_T exitg1;
  boolean_T valid;
  valid = true;
  k = 0;
  exitg1 = false;
  while ((!exitg1) && (k < 8)) {
    if (rtIsInfF(values[k]) || rtIsNaNF(values[k])) {
      valid = false;
      exitg1 = true;
    } else if (values[k] <= 0.0F) {
      valid = false;
      exitg1 = true;
    } else {
      k++;
    }
  }

  return valid;
}

static boolean_T airbag_13Hz_any(const boolean_T x[3])
{
  int32_T k;
  boolean_T exitg1;
  boolean_T y;
  y = false;
  k = 0;
  exitg1 = false;
  while ((!exitg1) && (k < 3)) {
    if (x[k]) {
      y = true;
      exitg1 = true;
    } else {
      k++;
    }
  }

  return y;
}

static void Zairbag_13Hz_Fin_makeThresholds(real32_T lumbarRatio, real32_T
  wingRatio, real32_T leftLegRatio, real32_T rightLegRatio, real32_T thresholds
  [8])
{
  real32_T leftCenter;
  real32_T lumbarCenter;
  real32_T rightCenter;
  real32_T wingCenter;
  lumbarCenter = lumbarRatio;
  if (rtIsInfF(lumbarRatio) || rtIsNaNF(lumbarRatio)) {
    lumbarCenter = 0.725F;
  } else if (lumbarRatio <= 0.0F) {
    lumbarCenter = 0.725F;
  }

  wingCenter = wingRatio;
  if (rtIsInfF(wingRatio) || rtIsNaNF(wingRatio)) {
    wingCenter = 1.0F;
  } else if (wingRatio <= 0.0F) {
    wingCenter = 1.0F;
  }

  leftCenter = leftLegRatio;
  if (rtIsInfF(leftLegRatio) || rtIsNaNF(leftLegRatio)) {
    leftCenter = 0.705F;
  } else if (leftLegRatio <= 0.0F) {
    leftCenter = 0.705F;
  }

  rightCenter = rightLegRatio;
  if (rtIsInfF(rightLegRatio) || rtIsNaNF(rightLegRatio)) {
    rightCenter = 0.705F;
  } else if (rightLegRatio <= 0.0F) {
    rightCenter = 0.705F;
  }

  thresholds[0] = lumbarCenter + 0.2F;
  thresholds[1] = fmaxf(0.1F, lumbarCenter - 0.2F);
  thresholds[2] = fmaxf(0.1F, wingCenter - 0.2F);
  thresholds[3] = wingCenter + 0.2F;
  thresholds[4] = fmaxf(0.1F, leftCenter - 0.3F);
  thresholds[5] = leftCenter + 0.3F;
  thresholds[6] = fmaxf(0.1F, rightCenter - 0.3F);
  thresholds[7] = rightCenter + 0.3F;
}

static void Zairbag_13Hz_applyAdaptiveGears(real32_T frame[55], real32_T
  leftWingGear, real32_T rightWingGear, real32_T lumbarGear, real32_T
  leftLegGear, real32_T rightLegGear)
{
  int32_T airbagId;
  for (airbagId = 0; airbagId < 10; airbagId++) {
    int32_T idx;
    idx = (airbagId << 1) + 2;
    if ((airbagId + 1 == 4) || (airbagId + 1 == 2)) {
      frame[idx] = leftWingGear;
    } else if ((airbagId + 1 == 3) || (airbagId == 0)) {
      frame[idx] = rightWingGear;
    } else if ((airbagId + 1 == 5) || (airbagId + 1 == 6)) {
      frame[idx] = lumbarGear;
    } else {
      switch (airbagId + 1) {
       case 9:
        frame[idx] = leftLegGear;
        break;

       case 10:
        frame[idx] = rightLegGear;
        break;
      }
    }
  }
}

void airbag_13Hz_step(void)
{
  real_T r;
  int32_T SideWingleftGear;
  int32_T backrestData1_tmp;
  int32_T i;
  int32_T idx;
  int32_T nz;
  int32_T rtb_action;
  int32_T rtb_adaptiveUnlocked;
  int32_T rtb_healthSideWingLeftAction;
  int32_T rtb_healthSideWingRightAction;
  int32_T rtb_hipInflateRequest;
  int32_T rtb_leftAction;
  int32_T rtb_massageEnable;
  int32_T rtb_rightAction_b;
  int32_T xpageoffset;
  real32_T cushionMat7x8[56];
  real32_T cushionMat7x8_data[56];
  real32_T e[56];
  real32_T d[48];
  real32_T rtb_nvmWrite[15];
  real32_T tmp_data_1[13];
  real32_T rtb_status[9];
  real32_T tmp[8];
  real32_T c_y[6];
  real32_T addedEdgeLength;
  real32_T adjustCmd;
  real32_T adoptionFrequency;
  real32_T alpha;
  real32_T b_pressure;
  real32_T baseInflationSeconds;
  real32_T partCmd;
  real32_T pathIncrement;
  real32_T xtmp;
  uint32_T qY;
  uint32_T sitThresholdFrames;
  int8_T tmp_data[56];
  int8_T tmp_data_0[56];
  int8_T rtb_massageGears[14];
  int8_T d_0;
  int8_T rtb_reasonCode;
  int8_T voteCode;
  boolean_T b_validMask[56];
  boolean_T validMask[56];
  boolean_T tmp_0[3];
  boolean_T x_data[2];
  boolean_T x_data_0[2];
  boolean_T actionAllowed_tmp;
  boolean_T gapActive;
  boolean_T healthLeftEnded;
  boolean_T healthLeftNow;
  boolean_T healthRightEnded;
  boolean_T living;
  boolean_T longSitActive;
  boolean_T manualNow;
  boolean_T newReason;
  boolean_T requestIdle;
  boolean_T rtb_isOccupied;
  boolean_T rtb_stateChanged;
  boolean_T trigNow;
  static const int8_T f[4] = { 0, 1, 6, 7 };

  static const int8_T d_1[5] = { 6, 6, 9, 9, 9 };

  static const real32_T e_0[8] = { 0.8F, 0.65F, 0.7F, 1.3F, 0.65F, 0.76F, 0.65F,
    0.76F };

  static const int8_T g[5] = { 1, 0, -1, 5, 4 };

  static const int8_T h[5] = { 2, 2, 3, 3, 3 };

  boolean_T exitg1;
  boolean_T guard1;
  memset(&airbag_13Hz_Y.backrestData1[0], 0, 56U * sizeof(real32_T));
  memset(&airbag_13Hz_Y.cushionData1[0], 0, 48U * sizeof(real32_T));
  airbag_13Hz_Y.backrestData1[0] =
    airbag_13Hz_U.frame_data1[0];
  airbag_13Hz_Y.backrestData1[49] =
    airbag_13Hz_U.frame_data1[4];
  airbag_13Hz_Y.backrestData1[1] =
    airbag_13Hz_U.frame_data1[1];
  airbag_13Hz_Y.backrestData1[50] =
    airbag_13Hz_U.frame_data1[5];
  airbag_13Hz_Y.backrestData1[2] =
    airbag_13Hz_U.frame_data1[2];
  airbag_13Hz_Y.backrestData1[51] =
    airbag_13Hz_U.frame_data1[6];
  airbag_13Hz_Y.backrestData1[3] =
    airbag_13Hz_U.frame_data1[3];
  airbag_13Hz_Y.backrestData1[52] =
    airbag_13Hz_U.frame_data1[7];
  for (i = 0; i < 6; i++) {
    for (backrestData1_tmp = 0; backrestData1_tmp < 5; backrestData1_tmp++) {
      airbag_13Hz_Y.backrestData1[backrestData1_tmp + 7 * (i + 1)]
        = (&airbag_13Hz_U.frame_data1[8])[6 * backrestData1_tmp +
        i];
    }
  }

  for (i = 0; i < 8; i++) {
    tmp[i] = airbag_13Hz_U.frame_data1[i + 38];
  }

  for (i = 0; i < 4; i++) {
    backrestData1_tmp = (i + 2) * 7;
    airbag_13Hz_Y.backrestData1[backrestData1_tmp + 5] = tmp[i];
    airbag_13Hz_Y.backrestData1[backrestData1_tmp + 6] = tmp[i + 4];
  }

  for (i = 0; i < 5; i++) {
    airbag_13Hz_Y.cushionData1[i] =
      airbag_13Hz_U.frame_data1[i + 46];
    airbag_13Hz_Y.cushionData1[i + 42] =
      airbag_13Hz_U.frame_data1[i + 51];
  }

  for (i = 0; i < 6; i++) {
    for (backrestData1_tmp = 0; backrestData1_tmp < 6; backrestData1_tmp++) {
      airbag_13Hz_Y.cushionData1[backrestData1_tmp + 6 * (i + 1)] =
        (&airbag_13Hz_U.frame_data1[56])[6 * backrestData1_tmp + i];
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 8;
       rtb_hipInflateRequest++) {
    xtmp = airbag_13Hz_Y.backrestData1[7 * rtb_hipInflateRequest];
    backrestData1_tmp = 7 * rtb_hipInflateRequest + 6;
    airbag_13Hz_Y.backrestData1[7 * rtb_hipInflateRequest] =
      airbag_13Hz_Y.backrestData1[backrestData1_tmp];
    airbag_13Hz_Y.backrestData1[backrestData1_tmp] = xtmp;
    nz = 7 * rtb_hipInflateRequest + 1;
    xtmp = airbag_13Hz_Y.backrestData1[nz];
    backrestData1_tmp = 7 * rtb_hipInflateRequest + 5;
    airbag_13Hz_Y.backrestData1[nz] =
      airbag_13Hz_Y.backrestData1[backrestData1_tmp];
    airbag_13Hz_Y.backrestData1[backrestData1_tmp] = xtmp;
    nz = 7 * rtb_hipInflateRequest + 2;
    xtmp = airbag_13Hz_Y.backrestData1[nz];
    backrestData1_tmp = 7 * rtb_hipInflateRequest + 4;
    airbag_13Hz_Y.backrestData1[nz] =
      airbag_13Hz_Y.backrestData1[backrestData1_tmp];
    airbag_13Hz_Y.backrestData1[backrestData1_tmp] = xtmp;
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 4;
       rtb_hipInflateRequest++) {
    for (nz = 0; nz < 6; nz++) {
      rtb_adaptiveUnlocked = 6 * rtb_hipInflateRequest + nz;
      xtmp = airbag_13Hz_Y.cushionData1[rtb_adaptiveUnlocked];
      backrestData1_tmp = (7 - rtb_hipInflateRequest) * 6 + nz;
      airbag_13Hz_Y.cushionData1[rtb_adaptiveUnlocked] =
        airbag_13Hz_Y.cushionData1[backrestData1_tmp];
      airbag_13Hz_Y.cushionData1[backrestData1_tmp] = xtmp;
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 8;
       rtb_hipInflateRequest++) {
    xtmp = airbag_13Hz_Y.cushionData1[6 * rtb_hipInflateRequest];
    backrestData1_tmp = 6 * rtb_hipInflateRequest + 5;
    airbag_13Hz_Y.cushionData1[6 * rtb_hipInflateRequest] =
      airbag_13Hz_Y.cushionData1[backrestData1_tmp];
    airbag_13Hz_Y.cushionData1[backrestData1_tmp] = xtmp;
    nz = 6 * rtb_hipInflateRequest + 1;
    xtmp = airbag_13Hz_Y.cushionData1[nz];
    backrestData1_tmp = 6 * rtb_hipInflateRequest + 4;
    airbag_13Hz_Y.cushionData1[nz] =
      airbag_13Hz_Y.cushionData1[backrestData1_tmp];
    airbag_13Hz_Y.cushionData1[backrestData1_tmp] = xtmp;
    nz = 6 * rtb_hipInflateRequest + 2;
    xtmp = airbag_13Hz_Y.cushionData1[nz];
    backrestData1_tmp = 6 * rtb_hipInflateRequest + 3;
    airbag_13Hz_Y.cushionData1[nz] =
      airbag_13Hz_Y.cushionData1[backrestData1_tmp];
    airbag_13Hz_Y.cushionData1[backrestData1_tmp] = xtmp;
  }

  for (i = 0; i < 6; i++) {
    airbag_13Hz_Y.cushionData1[i] = 0.0F;
    airbag_13Hz_Y.cushionData1[i + 42] = 0.0F;
  }

  for (backrestData1_tmp = 0; backrestData1_tmp < 56; backrestData1_tmp++) {
    if (airbag_13Hz_Y.backrestData1[backrestData1_tmp] < 20.0F) {
      airbag_13Hz_Y.backrestData1[backrestData1_tmp] = 0.0F;
    }
  }

  for (backrestData1_tmp = 0; backrestData1_tmp < 48; backrestData1_tmp++) {
    if (airbag_13Hz_Y.cushionData1[backrestData1_tmp] < 20.0F) {
      airbag_13Hz_Y.cushionData1[backrestData1_tmp] = 0.0F;
    }
  }

  xtmp = airbag_13Hz_U.cushionThreshold1;
  alpha = airbag_13Hz_U.pointThreshold1;
  if (rtIsInfF(airbag_13Hz_U.cushionThreshold1) || rtIsNaNF
      (airbag_13Hz_U.cushionThreshold1)) {
    xtmp = 3200.0F;
  } else if (airbag_13Hz_U.cushionThreshold1 <= 0.0F) {
    xtmp = 3200.0F;
  }

  if (rtIsInfF(airbag_13Hz_U.pointThreshold1) || rtIsNaNF
      (airbag_13Hz_U.pointThreshold1)) {
    alpha = 20.0F;
  } else if (airbag_13Hz_U.pointThreshold1 <= 0.0F) {
    alpha = 20.0F;
  }

  if ((!airbag_13Hz_DW.pState_not_empty) ||
      airbag_13Hz_U.resetFlag1) {
    airbag_13Hz_DW.pState_i = 0;
    airbag_13Hz_DW.pState_not_empty = true;
    airbag_13Hz_DW.pBackrestLostCounter = 0;
  }

  memset(&cushionMat7x8[0], 0, 56U * sizeof(real32_T));
  for (i = 0; i < 8; i++) {
    for (backrestData1_tmp = 0; backrestData1_tmp < 6; backrestData1_tmp++) {
      cushionMat7x8[backrestData1_tmp + 7 * i] =
        airbag_13Hz_Y.cushionData1[6 * i + backrestData1_tmp];
    }
  }

  Zairb_calculatePressureFeatures(cushionMat7x8, alpha, &partCmd,
    &airbag_13Hz_Y.cushionSum1);
  Zairb_calculatePressureFeatures(airbag_13Hz_Y.backrestData1,
    alpha, &partCmd, &airbag_13Hz_Y.backrestSum1);
  voteCode = airbag_13Hz_DW.pState_i;
  rtb_reasonCode = 0;
  switch (airbag_13Hz_DW.pState_i) {
   case 0:
    if (airbag_13Hz_Y.cushionSum1 >= xtmp) {
      airbag_13Hz_DW.pBackrestLostCounter = 0;
      if (airbag_13Hz_Y.backrestSum1 >=
          airbag_13Hz_U.backrestThreshold1) {
        voteCode = 2;
        rtb_reasonCode = 2;
      } else {
        voteCode = 1;
        rtb_reasonCode = 1;
      }
    }
    break;

   case 1:
    if (airbag_13Hz_Y.cushionSum1 < xtmp) {
      voteCode = 0;
      airbag_13Hz_DW.pBackrestLostCounter = 0;
      rtb_reasonCode = 4;
    } else if (airbag_13Hz_Y.backrestSum1 >=
               airbag_13Hz_U.backrestThreshold1) {
      voteCode = 2;
      airbag_13Hz_DW.pBackrestLostCounter = 0;
      rtb_reasonCode = 3;
    }
    break;

   default:
    if (airbag_13Hz_Y.cushionSum1 < xtmp) {
      voteCode = 0;
      airbag_13Hz_DW.pBackrestLostCounter = 0;
      rtb_reasonCode = 4;
    } else if (airbag_13Hz_Y.backrestSum1 <
               airbag_13Hz_U.backrestThreshold1) {
      if (airbag_13Hz_DW.pBackrestLostCounter > 2147483646) {
        airbag_13Hz_DW.pBackrestLostCounter = MAX_int32_T;
      } else {
        airbag_13Hz_DW.pBackrestLostCounter++;
      }

      if (airbag_13Hz_DW.pBackrestLostCounter >= 13) {
        voteCode = 1;
        airbag_13Hz_DW.pBackrestLostCounter = 0;
        rtb_reasonCode = 5;
      }
    } else {
      airbag_13Hz_DW.pBackrestLostCounter = 0;
    }
    break;
  }

  rtb_stateChanged = (airbag_13Hz_DW.pState_i != voteCode);
  airbag_13Hz_DW.pState_i = voteCode;
  rtb_isOccupied = ((airbag_13Hz_DW.pState_i == 1) ||
                    (airbag_13Hz_DW.pState_i == 2));
  if (airbag_13Hz_U.sadNormalizeScaleIn1 <= 0.0F) {
    xtmp = 3.0F;
  } else {
    xtmp = airbag_13Hz_U.sadNormalizeScaleIn1;
  }

  if (!airbag_13Hz_DW.frameCount_not_empty) {
    memcpy(&airbag_13Hz_DW.prevCushion[0],
           &airbag_13Hz_Y.cushionData1[0], 48U * sizeof(real32_T));
    memcpy(&airbag_13Hz_DW.prevBackrest[0],
           &airbag_13Hz_Y.backrestData1[0], 56U * sizeof(real32_T));
    for (i = 0; i < 13; i++) {
      airbag_13Hz_DW.sadHistCushion[i] = 0.0F;
      airbag_13Hz_DW.sadHistBackrest[i] = 0.0F;
    }

    airbag_13Hz_DW.sadCount = 0.0;
    airbag_13Hz_DW.frameCount = 0.0;
    airbag_13Hz_DW.frameCount_not_empty = true;
    airbag_13Hz_DW.livingQueue[0] = false;
    airbag_13Hz_DW.livingQueue[1] = false;
    airbag_13Hz_DW.livingQueueLen = 0.0;
    airbag_13Hz_DW.staticQueueLen = 0.0;
    airbag_13Hz_DW.latestRaw = false;
    airbag_13Hz_DW.latestConfidence = 0.0F;
    airbag_13Hz_DW.sessionLivingLatched = false;
    airbag_13Hz_DW.sessionStaticLatched = false;
  } else if (airbag_13Hz_U.resetFlag1) {
    memcpy(&airbag_13Hz_DW.prevCushion[0],
           &airbag_13Hz_Y.cushionData1[0], 48U * sizeof(real32_T));
    memcpy(&airbag_13Hz_DW.prevBackrest[0],
           &airbag_13Hz_Y.backrestData1[0], 56U * sizeof(real32_T));
    for (i = 0; i < 13; i++) {
      airbag_13Hz_DW.sadHistCushion[i] = 0.0F;
      airbag_13Hz_DW.sadHistBackrest[i] = 0.0F;
    }

    airbag_13Hz_DW.sadCount = 0.0;
    airbag_13Hz_DW.frameCount = 0.0;
    airbag_13Hz_DW.livingQueue[0] = false;
    airbag_13Hz_DW.livingQueue[1] = false;
    airbag_13Hz_DW.livingQueueLen = 0.0;
    airbag_13Hz_DW.staticQueueLen = 0.0;
    airbag_13Hz_DW.latestRaw = false;
    airbag_13Hz_DW.latestConfidence = 0.0F;
    airbag_13Hz_DW.sessionLivingLatched = false;
    airbag_13Hz_DW.sessionStaticLatched = false;
  }

  airbag_13Hz_DW.frameCount++;
  memset(&cushionMat7x8[0], 0, 56U * sizeof(real32_T));
  for (i = 0; i < 56; i++) {
    validMask[i] = false;
  }

  for (backrestData1_tmp = 0; backrestData1_tmp < 48; backrestData1_tmp++) {
    airbag_13Hz_DW.prevCushion[backrestData1_tmp] =
      airbag_13Hz_Y.cushionData1[backrestData1_tmp] -
      airbag_13Hz_DW.prevCushion[backrestData1_tmp];
    d[backrestData1_tmp] = fabsf
      (airbag_13Hz_DW.prevCushion[backrestData1_tmp]);
  }

  for (i = 0; i < 8; i++) {
    for (backrestData1_tmp = 0; backrestData1_tmp < 6; backrestData1_tmp++) {
      rtb_hipInflateRequest = 7 * i + backrestData1_tmp;
      cushionMat7x8[rtb_hipInflateRequest] = d[6 * i + backrestData1_tmp];
      validMask[rtb_hipInflateRequest] = true;
    }
  }

  validMask[0] = false;
  validMask[49] = false;
  for (backrestData1_tmp = 0; backrestData1_tmp < 56; backrestData1_tmp++) {
    airbag_13Hz_DW.prevBackrest[backrestData1_tmp] =
      airbag_13Hz_Y.backrestData1[backrestData1_tmp] -
      airbag_13Hz_DW.prevBackrest[backrestData1_tmp];
    e[backrestData1_tmp] = fabsf
      (airbag_13Hz_DW.prevBackrest[backrestData1_tmp]);
    b_validMask[backrestData1_tmp] = true;
  }

  for (i = 0; i < 4; i++) {
    backrestData1_tmp = 7 * f[i];
    b_validMask[backrestData1_tmp] = false;
    b_validMask[backrestData1_tmp + 1] = false;
  }

  b_validMask[2] = false;
  b_validMask[51] = false;
  memcpy(&airbag_13Hz_DW.prevCushion[0],
         &airbag_13Hz_Y.cushionData1[0], 48U * sizeof(real32_T));
  memcpy(&airbag_13Hz_DW.prevBackrest[0],
         &airbag_13Hz_Y.backrestData1[0], 56U * sizeof(real32_T));
  if (rtIsInf(airbag_13Hz_DW.frameCount - 1.0)) {
    r = (rtNaN);
  } else {
    r = fmod(airbag_13Hz_DW.frameCount - 1.0, 13.0);
    if (r == 0.0) {
      r = 0.0;
    }
  }

  backrestData1_tmp = 0;
  for (i = 0; i < 56; i++) {
    if (validMask[i]) {
      backrestData1_tmp++;
    }
  }

  rtb_hipInflateRequest = backrestData1_tmp;
  backrestData1_tmp = 0;
  for (i = 0; i < 56; i++) {
    if (validMask[i]) {
      tmp_data[backrestData1_tmp] = (int8_T)i;
      backrestData1_tmp++;
    }
  }

  for (i = 0; i < rtb_hipInflateRequest; i++) {
    cushionMat7x8_data[i] = cushionMat7x8[tmp_data[i]];
  }

  airbag_13Hz_DW.sadHistCushion[(int32_T)(r + 1.0) - 1] =
    airbag_13Hz_sum(cushionMat7x8_data, &rtb_hipInflateRequest) /
    46.0F;
  backrestData1_tmp = 0;
  for (i = 0; i < 56; i++) {
    if (b_validMask[i]) {
      backrestData1_tmp++;
    }
  }

  rtb_hipInflateRequest = backrestData1_tmp;
  backrestData1_tmp = 0;
  for (i = 0; i < 56; i++) {
    if (b_validMask[i]) {
      tmp_data_0[backrestData1_tmp] = (int8_T)i;
      backrestData1_tmp++;
    }
  }

  for (i = 0; i < rtb_hipInflateRequest; i++) {
    cushionMat7x8_data[i] = e[tmp_data_0[i]];
  }

  airbag_13Hz_DW.sadHistBackrest[(int32_T)(r + 1.0) - 1] =
    airbag_13Hz_sum(cushionMat7x8_data, &rtb_hipInflateRequest) /
    46.0F;
  airbag_13Hz_DW.sadCount = fmin
    (airbag_13Hz_DW.sadCount + 1.0, 13.0);
  if (rtIsInf(airbag_13Hz_DW.frameCount)) {
    r = (rtNaN);
  } else {
    r = fmod(airbag_13Hz_DW.frameCount, 13.0);
    if (r == 0.0) {
      r = 0.0;
    }
  }

  trigNow = ((r == 0.0) && (airbag_13Hz_DW.sadCount >= 13.0));
  rtb_hipInflateRequest = (int32_T)airbag_13Hz_DW.sadCount;
  i = (int32_T)airbag_13Hz_DW.sadCount;
  if (rtb_hipInflateRequest - 1 >= 0) {
    memcpy(&tmp_data_1[0], &airbag_13Hz_DW.sadHistCushion[0],
           (uint32_T)rtb_hipInflateRequest * sizeof(real32_T));
  }

  airbag_13Hz_Y.sadCushion1 = airbag_13Hz_mean
    (tmp_data_1, &i);
  i = (int32_T)airbag_13Hz_DW.sadCount;
  if (rtb_hipInflateRequest - 1 >= 0) {
    memcpy(&tmp_data_1[0], &airbag_13Hz_DW.sadHistBackrest[0],
           (uint32_T)rtb_hipInflateRequest * sizeof(real32_T));
  }

  airbag_13Hz_Y.sadBackrest1 = airbag_13Hz_mean
    (tmp_data_1, &i);
  airbag_13Hz_Y.sadEnergy1 = fmaxf
    (airbag_13Hz_Y.sadCushion1,
     airbag_13Hz_Y.sadBackrest1);
  airbag_13Hz_Y.sadScore1 = fminf(1.0F,
    airbag_13Hz_Y.sadEnergy1 / xtmp);
  if ((airbag_13Hz_DW.pState_i == 0) &&
      (airbag_13Hz_DW.sadCount >= 13.0) &&
      ((!(airbag_13Hz_DW.noiseWarmCount >= 39.0F)) ||
       (!(airbag_13Hz_Y.sadEnergy1 > 6.0F * fmaxf
          (airbag_13Hz_DW.noiseDev, 0.05F) +
          airbag_13Hz_DW.noiseBaseline)))) {
    if (airbag_13Hz_DW.noiseWarmCount < 39.0F) {
      alpha = 0.0625F;
      airbag_13Hz_DW.noiseWarmCount++;
    } else {
      alpha = 0.0039F;
    }

    airbag_13Hz_DW.noiseBaseline +=
      (airbag_13Hz_Y.sadEnergy1 -
       airbag_13Hz_DW.noiseBaseline) * alpha;
    airbag_13Hz_DW.noiseDev = fmaxf((fabsf
      (airbag_13Hz_Y.sadEnergy1 -
       airbag_13Hz_DW.noiseBaseline) -
      airbag_13Hz_DW.noiseDev) * alpha +
      airbag_13Hz_DW.noiseDev, 0.05F);
  }

  newReason = !rtb_isOccupied;
  if (newReason) {
    airbag_13Hz_DW.sessionLivingLatched = false;
    airbag_13Hz_DW.sessionStaticLatched = false;
    airbag_13Hz_DW.livingQueue[0] = false;
    airbag_13Hz_DW.livingQueue[1] = false;
    airbag_13Hz_DW.livingQueueLen = 0.0;
    airbag_13Hz_DW.staticQueueLen = 0.0;
  }

  airbag_13Hz_Y.confidence1 =
    airbag_13Hz_DW.latestConfidence;
  if (trigNow) {
    if (airbag_13Hz_U.sadThresholdIn1 <= 0.0F) {
      baseInflationSeconds = 0.2F;
    } else {
      baseInflationSeconds = fminf(1.0F,
        airbag_13Hz_U.sadThresholdIn1);
    }

    airbag_13Hz_DW.latestRaw =
      (airbag_13Hz_Y.sadEnergy1 >= fmaxf(baseInflationSeconds *
        xtmp, 3.0F * fmaxf(airbag_13Hz_DW.noiseDev, 0.05F) +
        airbag_13Hz_DW.noiseBaseline));
    airbag_13Hz_Y.confidence1 =
      airbag_13Hz_Y.sadScore1;
    airbag_13Hz_DW.latestConfidence =
      airbag_13Hz_Y.sadScore1;
    if (rtb_isOccupied) {
      if (airbag_13Hz_DW.livingQueueLen < 2.0) {
        airbag_13Hz_DW.livingQueueLen++;
      }

      airbag_13Hz_DW.livingQueue[0] =
        airbag_13Hz_DW.livingQueue[1];
      airbag_13Hz_DW.livingQueue[1] =
        airbag_13Hz_DW.latestRaw;
      rtb_hipInflateRequest = (int32_T)
        airbag_13Hz_DW.livingQueueLen;
      for (i = 0; i < rtb_hipInflateRequest; i++) {
        x_data[i] = !airbag_13Hz_DW.livingQueue[i];
      }

      nz = x_data[0];
      for (backrestData1_tmp = 2; backrestData1_tmp <= rtb_hipInflateRequest;
           backrestData1_tmp++) {
        nz += x_data[1];
      }

      airbag_13Hz_DW.staticQueueLen = nz;
    }
  }

  if (airbag_13Hz_DW.livingQueueLen < 2.0) {
    if ((2.0 - airbag_13Hz_DW.livingQueueLen) + 1.0 > 2.0) {
      backrestData1_tmp = 0;
      nz = 0;
    } else {
      backrestData1_tmp = 1;
      nz = 2;
    }

    rtb_hipInflateRequest = nz - backrestData1_tmp;
    for (i = 0; i < rtb_hipInflateRequest; i++) {
      x_data[i] = airbag_13Hz_DW.livingQueue[backrestData1_tmp + i];
    }
  } else {
    rtb_hipInflateRequest = 2;
    x_data[0] = airbag_13Hz_DW.livingQueue[0];
    x_data[1] = airbag_13Hz_DW.livingQueue[1];
  }

  if (newReason) {
    voteCode = 0;
  } else {
    if (rtb_hipInflateRequest < 2) {
      voteCode = 2;
    } else {
      rtb_hipInflateRequest = 2;
      x_data_0[0] = x_data[0];
      x_data_0[1] = x_data[1];
      if (Zairbag_1_combineVectorElements(x_data_0, &rtb_hipInflateRequest) >=
          2.0F) {
        voteCode = 3;
      } else {
        voteCode = 2;
      }
    }

    if (airbag_13Hz_DW.sessionLivingLatched) {
      voteCode = 3;
    } else if (airbag_13Hz_DW.sessionStaticLatched) {
      voteCode = 2;
    } else if (voteCode == 3) {
      airbag_13Hz_DW.sessionLivingLatched = true;
      voteCode = 3;
    } else if (airbag_13Hz_DW.staticQueueLen >= 3.0) {
      airbag_13Hz_DW.sessionStaticLatched = true;
      voteCode = 2;
    } else {
      voteCode = 1;
    }
  }

  rtb_adaptiveUnlocked = (airbag_13Hz_DW.sessionLivingLatched &&
    rtb_isOccupied);
  if (!airbag_13Hz_DW.phase_not_empty) {
    airbag_13Hz_DW.phase = 0U;
    airbag_13Hz_DW.phase_not_empty = true;
  }

  manualNow = (airbag_13Hz_U.manualMassageOn1 >= 0.5F);
  xtmp = airbag_13Hz_U.sitThresholdmin1;
  if (rtIsInfF(airbag_13Hz_U.sitThresholdmin1) || rtIsNaNF
      (airbag_13Hz_U.sitThresholdmin1)) {
    xtmp = 5.0F;
  } else if (airbag_13Hz_U.sitThresholdmin1 <= 0.0F) {
    xtmp = 5.0F;
  }

  sitThresholdFrames = (uint32_T)fmax(1.0, fmin(ceil(xtmp * 60.0F /
    0.076923079788684845), 4.294967295E+9));
  rtb_massageEnable = 0;
  for (i = 0; i < 14; i++) {
    rtb_massageGears[i] = 0;
  }

  airbag_13Hz_Y.longSitMinutes1 = 0.0F;
  airbag_13Hz_Y.longSitMassageActive1 = 0.0F;
  airbag_13Hz_Y.longSitCycleRemain1 = 0.0F;
  airbag_13Hz_Y.longSitPrompt1 = 0.0F;
  rtb_hipInflateRequest = 0;
  if (rtb_isOccupied && (!airbag_13Hz_DW.prevOccupied)) {
    airbag_13Hz_DW.phase = 0U;
    airbag_13Hz_DW.sitFrameCount = 0U;
    airbag_13Hz_DW.massageFrameCount = 0U;
    airbag_13Hz_DW.livingLatched = false;
    airbag_13Hz_DW.hipCycleCount = 0U;
    airbag_13Hz_DW.hipInflateCount = 0U;
    airbag_13Hz_DW.hipInflating = false;
  }

  airbag_13Hz_DW.livingLatched = ((rtb_isOccupied && (voteCode ==
    3)) || airbag_13Hz_DW.livingLatched);
  if (airbag_13Hz_U.resetFlag1 ||
      (airbag_13Hz_DW.pState_i == 3) || newReason) {
    if (airbag_13Hz_DW.phase == 1) {
      for (i = 0; i < 14; i++) {
        rtb_massageGears[i] = 4;
      }
    }

    airbag_13Hz_DW.phase = 0U;
    airbag_13Hz_DW.sitFrameCount = 0U;
    airbag_13Hz_DW.massageFrameCount = 0U;
    airbag_13Hz_DW.livingLatched = false;
    airbag_13Hz_DW.hipCycleCount = 0U;
    airbag_13Hz_DW.hipInflateCount = 0U;
    airbag_13Hz_DW.hipInflating = false;
    airbag_13Hz_DW.prevOccupied = rtb_isOccupied;
    airbag_13Hz_DW.prevManualCmd = manualNow;
  } else if (!(airbag_13Hz_U.longSitMassageStop1 < 1.0F)) {
    if (airbag_13Hz_DW.phase == 1) {
      for (i = 0; i < 14; i++) {
        rtb_massageGears[i] = 4;
      }
    }

    airbag_13Hz_DW.phase = 0U;
    airbag_13Hz_DW.sitFrameCount = 0U;
    airbag_13Hz_DW.massageFrameCount = 0U;
    airbag_13Hz_DW.hipCycleCount = 0U;
    airbag_13Hz_DW.hipInflateCount = 0U;
    airbag_13Hz_DW.hipInflating = false;
    airbag_13Hz_DW.prevOccupied = true;
    airbag_13Hz_DW.prevManualCmd = manualNow;
  } else if ((!airbag_13Hz_DW.livingLatched) &&
             (airbag_13Hz_DW.phase != 1) &&
             (airbag_13Hz_DW.phase != 2)) {
    airbag_13Hz_DW.phase = 0U;
    airbag_13Hz_DW.sitFrameCount = 0U;
    airbag_13Hz_DW.massageFrameCount = 0U;
    airbag_13Hz_DW.hipCycleCount = 0U;
    airbag_13Hz_DW.hipInflateCount = 0U;
    airbag_13Hz_DW.hipInflating = false;
    airbag_13Hz_DW.prevOccupied = true;
    airbag_13Hz_DW.prevManualCmd = manualNow;
  } else {
    if ((airbag_13Hz_DW.phase != 1) &&
        (airbag_13Hz_DW.phase != 2)) {
      qY = airbag_13Hz_DW.hipCycleCount + 1U;
      if (airbag_13Hz_DW.hipCycleCount + 1U <
          airbag_13Hz_DW.hipCycleCount) {
        qY = MAX_uint32_T;
      }

      airbag_13Hz_DW.hipCycleCount = qY;
      if ((airbag_13Hz_DW.hipCycleCount >= 3900U) &&
          (!airbag_13Hz_DW.hipInflating)) {
        airbag_13Hz_DW.hipInflating = true;
        airbag_13Hz_DW.hipInflateCount = 0U;
      }

      if (airbag_13Hz_DW.hipInflating) {
        qY = airbag_13Hz_DW.hipInflateCount + 1U;
        if (airbag_13Hz_DW.hipInflateCount + 1U <
            airbag_13Hz_DW.hipInflateCount) {
          qY = MAX_uint32_T;
        }

        airbag_13Hz_DW.hipInflateCount = qY;
        rtb_hipInflateRequest = 1;
        if (airbag_13Hz_DW.hipInflateCount >= 26U) {
          airbag_13Hz_DW.hipInflating = false;
          airbag_13Hz_DW.hipInflateCount = 0U;
          airbag_13Hz_DW.hipCycleCount = 0U;
          rtb_hipInflateRequest = 0;
        }
      }
    }

    if (manualNow && (!airbag_13Hz_DW.prevManualCmd) &&
        (airbag_13Hz_DW.phase != 1) &&
        (airbag_13Hz_DW.phase != 2)) {
      if (airbag_13Hz_DW.hipInflating) {
        airbag_13Hz_DW.phase = 2U;
      } else {
        airbag_13Hz_DW.hipInflating = true;
        airbag_13Hz_DW.hipInflateCount = 0U;
        airbag_13Hz_DW.phase = 2U;
      }

      airbag_13Hz_DW.prevOccupied = true;
      airbag_13Hz_DW.prevManualCmd = true;
    } else {
      switch (airbag_13Hz_DW.phase) {
       case 0U:
        if (airbag_13Hz_DW.sitFrameCount < sitThresholdFrames) {
          airbag_13Hz_DW.sitFrameCount++;
        }

        if (airbag_13Hz_DW.sitFrameCount >= sitThresholdFrames) {
          airbag_13Hz_Y.longSitPrompt1 = 1.0F;
          if (airbag_13Hz_DW.hipInflating) {
            airbag_13Hz_DW.phase = 2U;
          } else {
            airbag_13Hz_DW.hipInflating = true;
            airbag_13Hz_DW.hipInflateCount = 0U;
            airbag_13Hz_DW.phase = 2U;
          }

          airbag_13Hz_Y.longSitMinutes1 = xtmp;
        } else {
          airbag_13Hz_Y.longSitMinutes1 = (real32_T)
            airbag_13Hz_DW.sitFrameCount * 0.0769230798F / 60.0F;
          qY = sitThresholdFrames - airbag_13Hz_DW.sitFrameCount;
          if (qY > sitThresholdFrames) {
            qY = 0U;
          }

          airbag_13Hz_Y.longSitCycleRemain1 = (real32_T)qY;
        }
        break;

       case 2U:
        qY = airbag_13Hz_DW.hipInflateCount + 1U;
        if (airbag_13Hz_DW.hipInflateCount + 1U <
            airbag_13Hz_DW.hipInflateCount) {
          qY = MAX_uint32_T;
        }

        airbag_13Hz_DW.hipInflateCount = qY;
        rtb_hipInflateRequest = 1;
        for (i = 0; i < 14; i++) {
          rtb_massageGears[i] = 0;
        }

        airbag_13Hz_Y.longSitMinutes1 = (real32_T)
          airbag_13Hz_DW.sitFrameCount * 0.0769230798F / 60.0F;
        if (airbag_13Hz_DW.hipInflateCount >= 26U) {
          airbag_13Hz_DW.hipInflating = false;
          airbag_13Hz_DW.hipInflateCount = 0U;
          airbag_13Hz_DW.hipCycleCount = 0U;
          rtb_hipInflateRequest = 0;
          airbag_13Hz_DW.phase = 1U;
          airbag_13Hz_DW.massageFrameCount = 0U;
          rtb_massageEnable = 1;
          for (i = 0; i < 14; i++) {
            rtb_massageGears[i] = 3;
          }

          airbag_13Hz_Y.longSitMassageActive1 = 1.0F;
        }
        break;

       default:
        rtb_massageEnable = 1;
        for (i = 0; i < 14; i++) {
          rtb_massageGears[i] = 3;
        }

        airbag_13Hz_Y.longSitMassageActive1 = 1.0F;
        airbag_13Hz_Y.longSitMinutes1 = xtmp;
        if (airbag_13Hz_DW.massageFrameCount < 11700U) {
          airbag_13Hz_DW.massageFrameCount++;
        }

        if (airbag_13Hz_DW.massageFrameCount >= 11700U) {
          rtb_massageEnable = 0;
          for (i = 0; i < 14; i++) {
            rtb_massageGears[i] = 4;
          }

          airbag_13Hz_Y.longSitMassageActive1 = 0.0F;
          airbag_13Hz_DW.phase = 0U;
          airbag_13Hz_DW.sitFrameCount = 0U;
          airbag_13Hz_DW.massageFrameCount = 0U;
          airbag_13Hz_DW.hipCycleCount = 0U;
          airbag_13Hz_DW.hipInflateCount = 0U;
          airbag_13Hz_DW.hipInflating = false;
          airbag_13Hz_Y.longSitMinutes1 = 0.0F;
          airbag_13Hz_Y.longSitCycleRemain1 = (real32_T)
            sitThresholdFrames;
        }
        break;
      }

      airbag_13Hz_DW.prevOccupied = true;
      airbag_13Hz_DW.prevManualCmd = manualNow;
    }
  }

  nz = 0;
  alpha = roundf(airbag_13Hz_U.frontCmd1[0]);
  partCmd = roundf(airbag_13Hz_U.frontCmd1[1]);
  adjustCmd = Zairbag_13Hz_Final__directionOf
    (airbag_13Hz_U.frontCmd1[2]);
  baseInflationSeconds = airbag_13Hz_U.inflation_time2;
  if (rtIsInfF(airbag_13Hz_U.inflation_time2) || rtIsNaNF
      (airbag_13Hz_U.inflation_time2)) {
    baseInflationSeconds = 2.0F;
  } else if (airbag_13Hz_U.inflation_time2 < 0.0F) {
    baseInflationSeconds = 2.0F;
  }

  xtmp = airbag_13Hz_U.deflation_time1;
  if (rtIsInfF(airbag_13Hz_U.deflation_time1) || rtIsNaNF
      (airbag_13Hz_U.deflation_time1)) {
    xtmp = 2.0F;
  } else if (airbag_13Hz_U.deflation_time1 < 0.0F) {
    xtmp = 2.0F;
  }

  adoptionFrequency = airbag_13Hz_U.adoption_frequency1;
  if (rtIsInfF(airbag_13Hz_U.adoption_frequency1) || rtIsNaNF
      (airbag_13Hz_U.adoption_frequency1)) {
    adoptionFrequency = 1.0F;
  } else if (airbag_13Hz_U.adoption_frequency1 <= 0.0F) {
    adoptionFrequency = 1.0F;
  }

  adoptionFrequency = fmaxf(1.0F, adoptionFrequency);
  manualNow = ((real32_T)rtb_isOccupied > 0.5F);
  living = (rtb_adaptiveUnlocked > 0.5F);
  healthLeftNow = !manualNow;
  if (healthLeftNow) {
    airbag_13Hz_DW.pSeatHandled = 0.0F;
    airbag_13Hz_DW.pReplayIndex = 0;
    airbag_13Hz_DW.pPending[0] = 0.0F;
    airbag_13Hz_DW.pPending[1] = 0.0F;
    airbag_13Hz_DW.pPending[2] = 0.0F;
    for (i = 0; i < 5; i++) {
      airbag_13Hz_DW.pRequest[i] = 0.0F;
      airbag_13Hz_DW.pEditTimes[i] =
        airbag_13Hz_DW.pSavedTimes[i];
    }

    airbag_13Hz_DW.pBaseElapsed = 0.0F;
    airbag_13Hz_DW.pBaseReady = 0.0F;
    airbag_13Hz_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_DW.pGapCycles = 0;
    airbag_13Hz_DW.pEntryDeflate = 0.0F;
    if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
      airbag_13Hz_DW.pState = 3.0F;
    } else {
      airbag_13Hz_DW.pState = (real32_T)
        (airbag_13Hz_DW.pValid > 0.5F);
    }
  }

  actionAllowed_tmp = ((rtb_reasonCode == 1) || (rtb_reasonCode == 2));
  if ((manualNow && (airbag_13Hz_DW.pPrevOccupied <= 0.5F)) ||
      ((rtb_reasonCode != airbag_13Hz_DW.pPrevReasonCode_j) &&
       actionAllowed_tmp)) {
    airbag_13Hz_DW.pBaseElapsed = 0.0F;
    airbag_13Hz_DW.pBaseReady = 0.0F;
    airbag_13Hz_DW.pSeatHandled = 0.0F;
  }

  if (manualNow && (airbag_13Hz_DW.pBaseReady <= 0.5F)) {
    if (living) {
      airbag_13Hz_DW.pBaseElapsed++;
      if (airbag_13Hz_DW.pBaseElapsed >= baseInflationSeconds *
          adoptionFrequency) {
        airbag_13Hz_DW.pBaseReady = 1.0F;
        airbag_13Hz_DW.pBaseElapsed = 0.0F;
      }
    } else {
      airbag_13Hz_DW.pBaseElapsed = 0.0F;
    }
  }

  living = (manualNow && living && (airbag_13Hz_DW.pBaseReady >
             0.5F) && (!(rtb_massageEnable > 0.5F)));
  if ((airbag_13Hz_DW.UnitDelay2_DSTATE[0] > 0.5F) &&
      (airbag_13Hz_DW.pPrevNvmValid <= 0.5F)) {
    for (backrestData1_tmp = 0; backrestData1_tmp < 5; backrestData1_tmp++) {
      baseInflationSeconds =
        airbag_13Hz_DW.UnitDelay2_DSTATE[backrestData1_tmp + 1];
      if (rtIsInfF(baseInflationSeconds) || rtIsNaNF(baseInflationSeconds)) {
        baseInflationSeconds = 0.0F;
        airbag_13Hz_DW.pSavedTimes[backrestData1_tmp] = 0.0F;
      } else {
        d_0 = d_1[backrestData1_tmp];
        baseInflationSeconds = fmaxf(-(real32_T)d_0, fminf(d_0,
          baseInflationSeconds));
        airbag_13Hz_DW.pSavedTimes[backrestData1_tmp] =
          baseInflationSeconds;
      }

      airbag_13Hz_DW.pEditTimes[backrestData1_tmp] =
        baseInflationSeconds;
    }

    gapActive = Zairbag_13Hz__allFinitePositive
      (&airbag_13Hz_DW.UnitDelay2_DSTATE[6]);
    for (i = 0; i < 8; i++) {
      if (gapActive) {
        airbag_13Hz_DW.pThresholds[i] =
          airbag_13Hz_DW.UnitDelay2_DSTATE[i + 6];
      } else {
        airbag_13Hz_DW.pThresholds[i] = e_0[i];
      }
    }

    airbag_13Hz_DW.pAdaptiveOff = (real32_T)
      (airbag_13Hz_DW.UnitDelay2_DSTATE[14] > 0.5F);
    airbag_13Hz_DW.pValid = 1.0F;
    if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
      airbag_13Hz_DW.pState = 3.0F;
    } else {
      airbag_13Hz_DW.pState = 1.0F;
    }

    airbag_13Hz_DW.pSeatHandled = 0.0F;
    airbag_13Hz_DW.pReplayIndex = 0;
    airbag_13Hz_DW.pPending[0] = 0.0F;
    airbag_13Hz_DW.pPending[1] = 0.0F;
    airbag_13Hz_DW.pPending[2] = 0.0F;
  }

  if ((airbag_13Hz_DW.pRequest[0] > 0.5F) && living) {
    airbag_13Hz_DW.pRequestElapsed++;
    if (airbag_13Hz_DW.pRequestElapsed >= fmaxf(1.0F, fabsf
         (airbag_13Hz_DW.pRequest[3]) * adoptionFrequency)) {
      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.pRequest[i] = 0.0F;
      }

      airbag_13Hz_DW.pRequestElapsed = 0.0F;
      airbag_13Hz_DW.pGapCycles = 1;
    }
  }

  if (living && (airbag_13Hz_DW.pSeatHandled <= 0.5F)) {
    airbag_13Hz_DW.pSeatHandled = 1.0F;
    if (airbag_13Hz_DW.pValid > 0.5F) {
      if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
        airbag_13Hz_DW.pState = 3.0F;
      } else {
        airbag_13Hz_DW.pState = 1.0F;
      }

      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.pEditTimes[i] =
          airbag_13Hz_DW.pSavedTimes[i];
      }

      airbag_13Hz_DW.pReplayIndex = 1;
    } else if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
      airbag_13Hz_DW.pState = 3.0F;
    }
  }

  if ((alpha != 0.0F) && (alpha != airbag_13Hz_DW.pPrevFrontCmd[0]))
  {
    if (alpha == 1.0F) {
      airbag_13Hz_DW.pState = 1.0F;
      airbag_13Hz_DW.pPending[1] = 0.0F;
      airbag_13Hz_DW.pEntryDeflate = 1.0F;
      airbag_13Hz_DW.pReplayIndex = 0;
      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.pEditTimes[i] = 0.0F;
      }

      if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
        airbag_13Hz_DW.pAdaptiveOff = 0.0F;
        nz = 3;
      }
    } else if (alpha == 2.0F) {
      if (airbag_13Hz_DW.pState == 1.0F) {
        airbag_13Hz_DW.pPending[0] = 1.0F;
      }
    } else if (alpha == 3.0F) {
      airbag_13Hz_DW.pPending[1] = 1.0F;
      airbag_13Hz_DW.pEntryDeflate = 0.0F;
      if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
        airbag_13Hz_DW.pAdaptiveOff = 0.0F;
        nz = 3;
      }
    } else if (alpha == 4.0F) {
      airbag_13Hz_DW.pState = 0.0F;
      airbag_13Hz_DW.pValid = 0.0F;
      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.pSavedTimes[i] = 0.0F;
        airbag_13Hz_DW.pEditTimes[i] = 0.0F;
      }

      for (i = 0; i < 8; i++) {
        airbag_13Hz_DW.pThresholds[i] = e_0[i];
      }

      airbag_13Hz_DW.pReplayIndex = 0;
      airbag_13Hz_DW.pSeatHandled = 1.0F;
      airbag_13Hz_DW.pPending[0] = 0.0F;
      airbag_13Hz_DW.pPending[1] = 0.0F;
      airbag_13Hz_DW.pPending[2] = 1.0F;
      airbag_13Hz_DW.pAdaptiveOff = 0.0F;
      airbag_13Hz_DW.pEntryDeflate = 0.0F;
      nz = 2;
    } else if (alpha == 5.0F) {
      airbag_13Hz_DW.pState = 3.0F;
      airbag_13Hz_DW.pPending[1] = 0.0F;
      airbag_13Hz_DW.pEntryDeflate = 0.0F;
      if (airbag_13Hz_DW.pAdaptiveOff <= 0.5F) {
        airbag_13Hz_DW.pAdaptiveOff = 1.0F;
        nz = 3;
      }
    }
  }

  gapActive = (airbag_13Hz_DW.pGapCycles > 0);
  if (gapActive && (airbag_13Hz_DW.pGapCycles >= -2147483647)) {
    airbag_13Hz_DW.pGapCycles--;
  }

  longSitActive = !gapActive;
  requestIdle = ((airbag_13Hz_DW.pRequest[0] <= 0.5F) &&
                 longSitActive);
  if ((airbag_13Hz_DW.pPending[2] > 0.5F) && (requestIdle &&
       living)) {
    airbag_13Hz_DW.pRequest[0] = 1.0F;
    airbag_13Hz_DW.pRequest[1] = 0.0F;
    airbag_13Hz_DW.pRequest[2] = -1.0F;
    airbag_13Hz_DW.pRequest[3] = xtmp;
    airbag_13Hz_DW.pRequest[4] = 3.0F;
    airbag_13Hz_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_DW.pPending[2] = 0.0F;
    requestIdle = false;
  }

  if ((airbag_13Hz_DW.pEntryDeflate > 0.5F) && requestIdle &&
      living && (airbag_13Hz_DW.pPending[2] <= 0.5F)) {
    for (i = 0; i < 5; i++) {
      airbag_13Hz_DW.pRequest[i] = g[i];
    }

    airbag_13Hz_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_DW.pEntryDeflate = 0.0F;
    requestIdle = false;
  }

  if ((adjustCmd != 0.0F) && ((adjustCmd !=
        airbag_13Hz_DW.pPrevFrontCmd[2]) || (partCmd !=
        airbag_13Hz_DW.pPrevFrontCmd[1])) && requestIdle &&
      (airbag_13Hz_DW.pReplayIndex == 0) &&
      (airbag_13Hz_DW.pState == 1.0F) && living &&
      (airbag_13Hz_DW.pEntryDeflate <= 0.5F)) {
    tmp_0[0] = (airbag_13Hz_DW.pPending[0] > 0.5F);
    tmp_0[1] = (airbag_13Hz_DW.pPending[1] > 0.5F);
    tmp_0[2] = (airbag_13Hz_DW.pPending[2] > 0.5F);
    if (!airbag_13Hz_any(tmp_0)) {
      if (partCmd < 2.14748365E+9F) {
        if (partCmd >= -2.14748365E+9F) {
          i = (int32_T)partCmd;
        } else {
          i = MIN_int32_T;
        }
      } else {
        i = MAX_int32_T;
      }

      if ((i >= 1) && (i <= 5)) {
        xtmp = airbag_13Hz_DW.pEditTimes[i - 1];
        baseInflationSeconds = h[i - 1];
        adoptionFrequency = baseInflationSeconds * adjustCmd + xtmp;
        if (rtIsInfF(adoptionFrequency) || rtIsNaNF(adoptionFrequency)) {
          adoptionFrequency = 0.0F;
        } else {
          b_pressure = d_1[i - 1];
          adoptionFrequency = fmaxf(-b_pressure, fminf(b_pressure,
            adoptionFrequency));
        }

        if (xtmp != adoptionFrequency) {
          airbag_13Hz_DW.pEditTimes[i - 1] = adoptionFrequency;
          airbag_13Hz_DW.pRequest[0] = 1.0F;
          airbag_13Hz_DW.pRequest[1] = (real32_T)i;
          airbag_13Hz_DW.pRequest[2] = adjustCmd;
          airbag_13Hz_DW.pRequest[3] = baseInflationSeconds;
          airbag_13Hz_DW.pRequest[4] = 1.0F;
          airbag_13Hz_DW.pRequestElapsed = 0.0F;
          requestIdle = false;
        }
      }
    }
  }

  if ((airbag_13Hz_DW.pReplayIndex > 0) && living && requestIdle &&
      (airbag_13Hz_DW.pPending[2] <= 0.5F) &&
      (airbag_13Hz_DW.pEntryDeflate <= 0.5F)) {
    backrestData1_tmp = 0;
    exitg1 = false;
    while ((!exitg1) && (backrestData1_tmp < 5)) {
      if (airbag_13Hz_DW.pReplayIndex <= 5) {
        idx = airbag_13Hz_DW.pReplayIndex;
        xtmp =
          airbag_13Hz_DW.pSavedTimes[airbag_13Hz_DW.pReplayIndex
          - 1];
        airbag_13Hz_DW.pReplayIndex++;
        baseInflationSeconds = fabsf(xtmp);
        if (baseInflationSeconds > 0.01F) {
          airbag_13Hz_DW.pRequest[0] = 1.0F;
          airbag_13Hz_DW.pRequest[1] = (real32_T)idx;
          airbag_13Hz_DW.pRequest[2] =
            Zairbag_13Hz_Final__directionOf(xtmp);
          airbag_13Hz_DW.pRequest[3] = baseInflationSeconds;
          airbag_13Hz_DW.pRequest[4] = 2.0F;
          airbag_13Hz_DW.pRequestElapsed = 0.0F;
          exitg1 = true;
        } else {
          backrestData1_tmp++;
        }
      } else {
        backrestData1_tmp++;
      }
    }
  }

  if ((airbag_13Hz_DW.pReplayIndex > 5) &&
      (airbag_13Hz_DW.pRequest[0] <= 0.5F) && longSitActive) {
    airbag_13Hz_DW.pReplayIndex = 0;
  }

  if ((airbag_13Hz_DW.pRequest[0] <= 0.5F) &&
      ((airbag_13Hz_DW.pReplayIndex == 0) &&
       ((airbag_13Hz_DW.pPending[2] <= 0.5F) &&
        ((airbag_13Hz_DW.pEntryDeflate <= 0.5F) && longSitActive))))
  {
    if ((airbag_13Hz_DW.pPending[0] > 0.5F) && living) {
      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.pSavedTimes[i] =
          airbag_13Hz_DW.pEditTimes[i];
      }

      Zairbag_13Hz_Fin_makeThresholds
        (airbag_13Hz_DW.UnitDelay3_DSTATE[0],
         airbag_13Hz_DW.UnitDelay3_DSTATE[1],
         airbag_13Hz_DW.UnitDelay3_DSTATE[2],
         airbag_13Hz_DW.UnitDelay3_DSTATE[3],
         airbag_13Hz_DW.pThresholds);
      airbag_13Hz_DW.pValid = 1.0F;
      airbag_13Hz_DW.pState = 1.0F;
      airbag_13Hz_DW.pPending[0] = 0.0F;
      nz = 1;
    }

    if ((airbag_13Hz_DW.pPending[1] > 0.5F) &&
        (airbag_13Hz_DW.pPending[0] <= 0.5F)) {
      airbag_13Hz_DW.pState = 2.0F;
      airbag_13Hz_DW.pPending[1] = 0.0F;
    }
  }

  if (airbag_13Hz_DW.pRequest[0] > 0.5F) {
    gapActive = true;
  } else if (airbag_13Hz_DW.pReplayIndex > 0) {
    gapActive = true;
  } else {
    tmp_0[0] = (airbag_13Hz_DW.pPending[0] > 0.5F);
    tmp_0[1] = (airbag_13Hz_DW.pPending[1] > 0.5F);
    tmp_0[2] = (airbag_13Hz_DW.pPending[2] > 0.5F);
    gapActive = (airbag_13Hz_any(tmp_0) ||
                 ((airbag_13Hz_DW.pEntryDeflate > 0.5F) ||
                  gapActive));
  }

  requestIdle = (((airbag_13Hz_DW.pState == 0.0F) ||
                  (airbag_13Hz_DW.pState == 2.0F)) && living &&
                 ((real32_T)gapActive <= 0.5F));
  xtmp = airbag_13Hz_DW.pRequest[1];
  rtb_status[1] = airbag_13Hz_DW.pValid;
  rtb_status[2] = requestIdle;
  rtb_status[3] = gapActive;
  rtb_nvmWrite[0] = (real32_T)nz;
  for (i = 0; i < 5; i++) {
    rtb_status[i + 4] = airbag_13Hz_DW.pEditTimes[i];
    rtb_nvmWrite[i + 1] = airbag_13Hz_DW.pSavedTimes[i];
  }

  for (i = 0; i < 8; i++) {
    rtb_nvmWrite[i + 6] = airbag_13Hz_DW.pThresholds[i];
  }

  rtb_nvmWrite[14] = airbag_13Hz_DW.pAdaptiveOff;
  airbag_13Hz_DW.pPrevFrontCmd[0] = alpha;
  airbag_13Hz_DW.pPrevFrontCmd[1] = partCmd;
  airbag_13Hz_DW.pPrevFrontCmd[2] = adjustCmd;
  airbag_13Hz_DW.pPrevNvmValid =
    airbag_13Hz_DW.UnitDelay2_DSTATE[0];
  airbag_13Hz_DW.pPrevReasonCode_j = rtb_reasonCode;
  airbag_13Hz_DW.pPrevOccupied = manualNow;
  if (rtb_status[1] > 1.5F) {
    airbag_13Hz_Y.ratioInflate_out1 =
      airbag_13Hz_DW.pThresholds[0];
    airbag_13Hz_Y.ratioDeflate_out1 =
      airbag_13Hz_DW.pThresholds[1];
    airbag_13Hz_Y.ratioInflateLeft_out1 =
      airbag_13Hz_DW.pThresholds[2];
    airbag_13Hz_Y.ratioDeflateLeft_out1 =
      airbag_13Hz_DW.pThresholds[3];
    airbag_13Hz_Y.leftInflateThreshold_out1 =
      airbag_13Hz_DW.pThresholds[4];
    airbag_13Hz_Y.leftDeflateThreshold_out1 =
      airbag_13Hz_DW.pThresholds[5];
    airbag_13Hz_Y.rightInflateThreshold_out1 =
      airbag_13Hz_DW.pThresholds[6];
    airbag_13Hz_Y.rightDeflateThreshold_out1 =
      airbag_13Hz_DW.pThresholds[7];
  } else {
    airbag_13Hz_Y.ratioInflate_out1 =
      airbag_13Hz_U.ratioInflate1;
    airbag_13Hz_Y.ratioDeflate_out1 =
      airbag_13Hz_U.ratioDeflate1;
    airbag_13Hz_Y.ratioInflateLeft_out1 =
      airbag_13Hz_U.ratioInflateLeft1;
    airbag_13Hz_Y.ratioDeflateLeft_out1 =
      airbag_13Hz_U.ratioDeflateLeft1;
    airbag_13Hz_Y.leftInflateThreshold_out1 =
      airbag_13Hz_U.leftInflateThreshold1;
    airbag_13Hz_Y.leftDeflateThreshold_out1 =
      airbag_13Hz_U.leftDeflateThreshold1;
    airbag_13Hz_Y.rightInflateThreshold_out1 =
      airbag_13Hz_U.rightInflateThreshold1;
    airbag_13Hz_Y.rightDeflateThreshold_out1 =
      airbag_13Hz_U.rightDeflateThreshold1;
  }

  if (rtIsInfF(airbag_13Hz_Y.leftInflateThreshold_out1) ||
      rtIsNaNF(airbag_13Hz_Y.leftInflateThreshold_out1)) {
    airbag_13Hz_Y.leftInflateThreshold_out1 = 0.65F;
  } else if (airbag_13Hz_Y.leftInflateThreshold_out1 <= 0.0F) {
    airbag_13Hz_Y.leftInflateThreshold_out1 = 0.65F;
  }

  if (rtIsInfF(airbag_13Hz_Y.leftDeflateThreshold_out1) ||
      rtIsNaNF(airbag_13Hz_Y.leftDeflateThreshold_out1)) {
    airbag_13Hz_Y.leftDeflateThreshold_out1 = 0.76F;
  } else if (airbag_13Hz_Y.leftDeflateThreshold_out1 <= 0.0F) {
    airbag_13Hz_Y.leftDeflateThreshold_out1 = 0.76F;
  }

  if (rtIsInfF(airbag_13Hz_Y.rightInflateThreshold_out1) ||
      rtIsNaNF(airbag_13Hz_Y.rightInflateThreshold_out1)) {
    airbag_13Hz_Y.rightInflateThreshold_out1 = 0.65F;
  } else if (airbag_13Hz_Y.rightInflateThreshold_out1 <= 0.0F) {
    airbag_13Hz_Y.rightInflateThreshold_out1 = 0.65F;
  }

  if (rtIsInfF(airbag_13Hz_Y.rightDeflateThreshold_out1) ||
      rtIsNaNF(airbag_13Hz_Y.rightDeflateThreshold_out1)) {
    airbag_13Hz_Y.rightDeflateThreshold_out1 = 0.76F;
  } else if (airbag_13Hz_Y.rightDeflateThreshold_out1 <= 0.0F) {
    airbag_13Hz_Y.rightDeflateThreshold_out1 = 0.76F;
  }

  baseInflationSeconds = airbag_13Hz_Y.cushionData1[3];
  for (backrestData1_tmp = 0; backrestData1_tmp < 11; backrestData1_tmp++) {
    baseInflationSeconds += airbag_13Hz_Y.cushionData1[((int32_T)
      ((uint32_T)(backrestData1_tmp + 1) / 3U) * 6 + (backrestData1_tmp + 1) % 3)
      + 3];
  }

  airbag_13Hz_Y.leftButtMean1 = baseInflationSeconds / 12.0F;
  baseInflationSeconds = airbag_13Hz_Y.cushionData1[1];
  for (backrestData1_tmp = 0; backrestData1_tmp < 7; backrestData1_tmp++) {
    baseInflationSeconds += airbag_13Hz_Y.cushionData1
      [(((backrestData1_tmp + 1) >> 1) * 6 + (backrestData1_tmp + 1) % 2) + 1];
  }

  airbag_13Hz_Y.leftLegMean1 = baseInflationSeconds / 8.0F;
  baseInflationSeconds = airbag_13Hz_Y.cushionData1[27];
  for (backrestData1_tmp = 0; backrestData1_tmp < 11; backrestData1_tmp++) {
    baseInflationSeconds += airbag_13Hz_Y.cushionData1[(((int32_T)
      ((uint32_T)(backrestData1_tmp + 1) / 3U) + 4) * 6 + (backrestData1_tmp + 1)
      % 3) + 3];
  }

  airbag_13Hz_Y.rightButtMean1 = baseInflationSeconds / 12.0F;
  baseInflationSeconds = airbag_13Hz_Y.cushionData1[25];
  for (backrestData1_tmp = 0; backrestData1_tmp < 7; backrestData1_tmp++) {
    baseInflationSeconds += airbag_13Hz_Y.cushionData1
      [((((backrestData1_tmp + 1) >> 1) + 4) * 6 + (backrestData1_tmp + 1) % 2)
      + 1];
  }

  airbag_13Hz_Y.rightLegMean1 = baseInflationSeconds / 8.0F;
  if (airbag_13Hz_Y.leftButtMean1 > 0.0F) {
    airbag_13Hz_Y.leftLegRatio1 =
      airbag_13Hz_Y.leftLegMean1 /
      airbag_13Hz_Y.leftButtMean1;
  } else {
    airbag_13Hz_Y.leftLegRatio1 = 0.0F;
  }

  if (airbag_13Hz_Y.rightButtMean1 > 0.0F) {
    airbag_13Hz_Y.rightLegRatio1 =
      airbag_13Hz_Y.rightLegMean1 /
      airbag_13Hz_Y.rightButtMean1;
  } else {
    airbag_13Hz_Y.rightLegRatio1 = 0.0F;
  }

  if (airbag_13Hz_Y.leftLegRatio1 <
      airbag_13Hz_Y.leftInflateThreshold_out1) {
    rtb_leftAction = 1;
  } else if (airbag_13Hz_Y.leftLegRatio1 >
             airbag_13Hz_Y.leftDeflateThreshold_out1) {
    rtb_leftAction = 2;
  } else {
    rtb_leftAction = 0;
  }

  if (airbag_13Hz_Y.rightLegRatio1 <
      airbag_13Hz_Y.rightInflateThreshold_out1) {
    idx = 1;
  } else if (airbag_13Hz_Y.rightLegRatio1 >
             airbag_13Hz_Y.rightDeflateThreshold_out1) {
    idx = 2;
  } else {
    idx = 0;
  }

  adjustCmd = airbag_13Hz_Y.backrestData1[7];
  baseInflationSeconds = airbag_13Hz_Y.backrestData1[28];
  for (backrestData1_tmp = 0; backrestData1_tmp < 20; backrestData1_tmp++) {
    nz = (int32_T)((uint32_T)(backrestData1_tmp + 1) / 7U);
    rtb_rightAction_b = (backrestData1_tmp + 1) % 7;
    adjustCmd += airbag_13Hz_Y.backrestData1[(nz + 1) * 7 +
      rtb_rightAction_b];
    baseInflationSeconds += airbag_13Hz_Y.backrestData1[(nz + 4) *
      7 + rtb_rightAction_b];
  }

  airbag_13Hz_Y.leftPressure1 = adjustCmd * 1.57894742F;
  airbag_13Hz_Y.rightPressure1 = baseInflationSeconds *
    1.57894742F;
  for (rtb_rightAction_b = 0; rtb_rightAction_b < 6; rtb_rightAction_b++) {
    xpageoffset = rtb_rightAction_b * 7;
    baseInflationSeconds = airbag_13Hz_Y.backrestData1[((int32_T)
      ((uint32_T)xpageoffset / 7U) + 1) * 7 + xpageoffset % 7];
    for (backrestData1_tmp = 0; backrestData1_tmp < 6; backrestData1_tmp++) {
      nz = (xpageoffset + backrestData1_tmp) + 1;
      baseInflationSeconds += airbag_13Hz_Y.backrestData1
        [((int32_T)((uint32_T)nz / 7U) + 1) * 7 + nz % 7];
    }

    c_y[rtb_rightAction_b] = baseInflationSeconds;
  }

  baseInflationSeconds = c_y[0];
  for (backrestData1_tmp = 0; backrestData1_tmp < 5; backrestData1_tmp++) {
    baseInflationSeconds += c_y[backrestData1_tmp + 1];
  }

  airbag_13Hz_Y.backMeanTotal_wing1 = baseInflationSeconds / 38.0F;
  if ((airbag_13Hz_Y.rightPressure1 > 0.0F) &&
      (airbag_13Hz_Y.backMeanTotal_wing1 >
       airbag_13Hz_U.backTotalThreshold1)) {
    airbag_13Hz_Y.wingRatio1 =
      airbag_13Hz_Y.leftPressure1 /
      airbag_13Hz_Y.rightPressure1;
  } else {
    airbag_13Hz_Y.wingRatio1 = (real32_T)
      !(airbag_13Hz_Y.backMeanTotal_wing1 >
        airbag_13Hz_U.backTotalThreshold1);
  }

  if (airbag_13Hz_Y.wingRatio1 >
      airbag_13Hz_Y.ratioDeflateLeft_out1) {
    xpageoffset = 1;
    rtb_rightAction_b = 2;
  } else if (airbag_13Hz_Y.wingRatio1 <
             airbag_13Hz_Y.ratioInflateLeft_out1) {
    xpageoffset = 2;
    rtb_rightAction_b = 1;
  } else {
    xpageoffset = 0;
    rtb_rightAction_b = 0;
  }

  if (rtIsInfF(airbag_13Hz_Y.ratioInflate_out1) || rtIsNaNF
      (airbag_13Hz_Y.ratioInflate_out1)) {
    airbag_13Hz_Y.ratioInflate_out1 = 0.8F;
  } else if (airbag_13Hz_Y.ratioInflate_out1 <= 0.0F) {
    airbag_13Hz_Y.ratioInflate_out1 = 0.8F;
  }

  if (rtIsInfF(airbag_13Hz_Y.ratioDeflate_out1) || rtIsNaNF
      (airbag_13Hz_Y.ratioDeflate_out1)) {
    airbag_13Hz_Y.ratioDeflate_out1 = 0.65F;
  } else if (airbag_13Hz_Y.ratioDeflate_out1 <= 0.0F) {
    airbag_13Hz_Y.ratioDeflate_out1 = 0.65F;
  }

  baseInflationSeconds = airbag_13Hz_Y.backrestData1[0];
  for (backrestData1_tmp = 0; backrestData1_tmp < 31; backrestData1_tmp++) {
    baseInflationSeconds += airbag_13Hz_Y.backrestData1
      [((backrestData1_tmp + 1) >> 2) * 7 + (backrestData1_tmp + 1) % 4];
  }

  airbag_13Hz_Y.upperMean1 = baseInflationSeconds / 22.0F;
  baseInflationSeconds = airbag_13Hz_Y.backrestData1[4];
  for (backrestData1_tmp = 0; backrestData1_tmp < 23; backrestData1_tmp++) {
    baseInflationSeconds += airbag_13Hz_Y.backrestData1[((int32_T)
      ((uint32_T)(backrestData1_tmp + 1) / 3U) * 7 + (backrestData1_tmp + 1) % 3)
      + 4];
  }

  airbag_13Hz_Y.lowerMean1 = baseInflationSeconds / 24.0F;
  airbag_13Hz_Y.backMeanTotal_lumbar1 =
    airbag_13Hz_Y.upperMean1 +
    airbag_13Hz_Y.lowerMean1;
  if (airbag_13Hz_Y.lowerMean1 > 0.0F) {
    airbag_13Hz_Y.lumbarRatio1 =
      airbag_13Hz_Y.upperMean1 /
      airbag_13Hz_Y.lowerMean1;
  } else {
    airbag_13Hz_Y.lumbarRatio1 = 0.0F;
  }

  backrestData1_tmp = (airbag_13Hz_Y.backMeanTotal_lumbar1 >=
                       22.0F);
  if (backrestData1_tmp == 0) {
    rtb_action = 0;
  } else if (airbag_13Hz_Y.lumbarRatio1 >
             airbag_13Hz_Y.ratioInflate_out1) {
    rtb_action = 1;
  } else if (airbag_13Hz_Y.lumbarRatio1 <
             airbag_13Hz_Y.ratioDeflate_out1) {
    rtb_action = 2;
  } else {
    rtb_action = 0;
  }

  guard1 = false;
  if (airbag_13Hz_U.resetFlag1 || newReason) {
    memset(&airbag_13Hz_DW.pCopBufX[0], 0, 125U * sizeof(real32_T));
    memset(&airbag_13Hz_DW.pCopBufY[0], 0, 125U * sizeof(real32_T));
    airbag_13Hz_DW.pBufLen = 0;
    airbag_13Hz_DW.pWriteIndex = 0;
    airbag_13Hz_DW.pFrameCount = 0;
    airbag_13Hz_DW.pPeakPressure = 0.0F;
    airbag_13Hz_DW.pSumX = 0.0F;
    airbag_13Hz_DW.pSumY = 0.0F;
    airbag_13Hz_DW.pSumX2 = 0.0F;
    airbag_13Hz_DW.pSumY2 = 0.0F;
    airbag_13Hz_DW.pPathLength = 0.0F;
    airbag_13Hz_DW.pPathCompensation = 0.0F;
    if (newReason) {
    } else {
      guard1 = true;
    }
  } else {
    guard1 = true;
  }

  if (guard1) {
    adoptionFrequency = 0.0F;
    baseInflationSeconds = 0.0F;
    adjustCmd = 0.0F;
    for (nz = 0; nz < 8; nz++) {
      for (i = 0; i < 6; i++) {
        b_pressure = airbag_13Hz_Y.cushionData1[nz * 6 + i];
        if (rtIsInfF(b_pressure) || rtIsNaNF(b_pressure)) {
          b_pressure = 0.0F;
        } else if (b_pressure <= 4.0F) {
          b_pressure = 0.0F;
        }

        adoptionFrequency += b_pressure;
        baseInflationSeconds += (((real32_T)i + 1.0F) - 1.0F) * b_pressure;
        adjustCmd += (((real32_T)nz + 1.0F) - 1.0F) * b_pressure;
      }
    }

    if (adoptionFrequency > 0.0F) {
      baseInflationSeconds /= adoptionFrequency;
      adjustCmd /= adoptionFrequency;
    } else {
      baseInflationSeconds = 0.0F;
      adjustCmd = 0.0F;
    }

    if (!(adoptionFrequency <= 0.0F)) {
      if (airbag_13Hz_DW.pFrameCount <= 2147483646) {
        airbag_13Hz_DW.pFrameCount++;
      }

      if (adoptionFrequency > airbag_13Hz_DW.pPeakPressure) {
        airbag_13Hz_DW.pPeakPressure = adoptionFrequency;
      }

      if ((airbag_13Hz_DW.pFrameCount > 10) &&
          (!(adoptionFrequency < airbag_13Hz_DW.pPeakPressure *
             0.8F)) && (!(adoptionFrequency < 200.0F))) {
        if (airbag_13Hz_DW.pWriteIndex > 2147483646) {
          i = MAX_int32_T;
        } else {
          i = airbag_13Hz_DW.pWriteIndex + 1;
        }

        nz = i - 1;
        if (airbag_13Hz_DW.pWriteIndex > 2147483646) {
          i = MAX_int32_T;
        } else {
          i = airbag_13Hz_DW.pWriteIndex + 1;
        }

        if (i > 125) {
          nz = 0;
        }

        addedEdgeLength = 0.0F;
        if (airbag_13Hz_DW.pBufLen > 0) {
          i = nz - 1;
          if (nz < 1) {
            i = 124;
          }

          adoptionFrequency = baseInflationSeconds -
            airbag_13Hz_DW.pCopBufX[i];
          b_pressure = adjustCmd - airbag_13Hz_DW.pCopBufY[i];
          addedEdgeLength = (real32_T)sqrt(adoptionFrequency * adoptionFrequency
            + b_pressure * b_pressure);
        }

        if (airbag_13Hz_DW.pBufLen < 125) {
          airbag_13Hz_DW.pBufLen++;
          airbag_13Hz_DW.pSumX += baseInflationSeconds;
          airbag_13Hz_DW.pSumY += adjustCmd;
          airbag_13Hz_DW.pSumX2 += baseInflationSeconds *
            baseInflationSeconds;
          airbag_13Hz_DW.pSumY2 += adjustCmd * adjustCmd;
          pathIncrement = addedEdgeLength -
            airbag_13Hz_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_DW.pPathLength +
            pathIncrement;
          airbag_13Hz_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_DW.pPathLength) - pathIncrement;
          airbag_13Hz_DW.pPathLength = addedEdgeLength;
        } else {
          i = nz + 1;
          if (nz + 2 > 125) {
            i = 0;
          }

          adoptionFrequency = airbag_13Hz_DW.pCopBufX[i] -
            airbag_13Hz_DW.pCopBufX[nz];
          b_pressure = airbag_13Hz_DW.pCopBufY[i] -
            airbag_13Hz_DW.pCopBufY[nz];
          airbag_13Hz_DW.pSumX =
            (airbag_13Hz_DW.pSumX + baseInflationSeconds) -
            airbag_13Hz_DW.pCopBufX[nz];
          airbag_13Hz_DW.pSumY =
            (airbag_13Hz_DW.pSumY + adjustCmd) -
            airbag_13Hz_DW.pCopBufY[nz];
          airbag_13Hz_DW.pSumX2 = (baseInflationSeconds *
            baseInflationSeconds + airbag_13Hz_DW.pSumX2) -
            airbag_13Hz_DW.pCopBufX[nz] *
            airbag_13Hz_DW.pCopBufX[nz];
          airbag_13Hz_DW.pSumY2 = (adjustCmd * adjustCmd +
            airbag_13Hz_DW.pSumY2) -
            airbag_13Hz_DW.pCopBufY[nz] *
            airbag_13Hz_DW.pCopBufY[nz];
          pathIncrement = addedEdgeLength -
            airbag_13Hz_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_DW.pPathLength +
            pathIncrement;
          airbag_13Hz_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_DW.pPathLength) - pathIncrement;
          airbag_13Hz_DW.pPathLength = addedEdgeLength;
          pathIncrement = -(real32_T)sqrt(adoptionFrequency * adoptionFrequency
            + b_pressure * b_pressure) -
            airbag_13Hz_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_DW.pPathLength +
            pathIncrement;
          airbag_13Hz_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_DW.pPathLength) - pathIncrement;
          airbag_13Hz_DW.pPathLength = addedEdgeLength;
          if (airbag_13Hz_DW.pPathLength < 0.0F) {
            airbag_13Hz_DW.pPathLength = 0.0F;
            airbag_13Hz_DW.pPathCompensation = 0.0F;
          }
        }

        airbag_13Hz_DW.pCopBufX[nz] = baseInflationSeconds;
        airbag_13Hz_DW.pCopBufY[nz] = adjustCmd;
        airbag_13Hz_DW.pWriteIndex = nz + 1;
      }
    }
  }

  airbag_13Hz_Y.spineProtectActive1 = 0.0F;
  airbag_13Hz_Y.spineProtectSide1 = 0.0F;
  airbag_13Hz_Y.bumpReliefActive1 = 0.0F;
  airbag_13Hz_Y.motionSicknessActive1 = 0.0F;
  rtb_healthSideWingLeftAction = 0;
  rtb_healthSideWingRightAction = 0;
  nz = 0;
  airbag_13Hz_Y.spineBiasSeconds1 = 0.0F;
  airbag_13Hz_Y.bumpDetectSeconds1 = 0.0F;
  airbag_13Hz_Y.cushionForwardMoveMm1 = 0.0F;
  airbag_13Hz_Y.backrestDropRatio1 = 1.0F;
  airbag_13Hz_Y.sickEventCount1 = 0.0F;
  if (rtb_stateChanged || airbag_13Hz_U.resetFlag1 || newReason) {
    airbag_13Hz_DW.pSpineBiasSec = 0.0F;
    airbag_13Hz_DW.pSpineDir = 0.0F;
    airbag_13Hz_DW.pSpineActive = 0.0F;
    airbag_13Hz_DW.pSpineNeutralSec = 0.0F;
    airbag_13Hz_DW.pSpineActionTimer = 0.0F;
    airbag_13Hz_DW.pBumpDetectSec = 0.0F;
    airbag_13Hz_DW.pBumpClearSec = 0.0F;
    airbag_13Hz_DW.pBumpLatched = 0.0F;
    airbag_13Hz_DW.pBumpActionTimer = 0.0F;
    airbag_13Hz_DW.pHistoryValid = 0.0F;
    airbag_13Hz_DW.pForwardRefX = 0.0F;
    airbag_13Hz_DW.pForwardAge = 0.0F;
    airbag_13Hz_DW.pBackDropWindow = 0.0F;
    airbag_13Hz_DW.pSickPromptTimer = 0.0F;
    airbag_13Hz_DW.pBackPeakSum = 0.0F;
    airbag_13Hz_DW.pBackPeakAge = 0.0F;
    airbag_13Hz_DW.pSickEventCount = 0.0F;
    airbag_13Hz_DW.pSickEventGap = 0.0F;
    airbag_13Hz_DW.pSickCountAge = 0.0F;
    airbag_13Hz_DW.pDemoSpineTimer = 0.0F;
    airbag_13Hz_DW.pDemoSpineSide = 0.0F;
    airbag_13Hz_DW.pDemoBumpTimer = 0.0F;
    airbag_13Hz_DW.pDemoSickTimer = 0.0F;
    airbag_13Hz_DW.pPrevDemoCmd[0] =
      airbag_13Hz_U.frontCmd1[0];
    airbag_13Hz_DW.pPrevDemoCmd[1] =
      airbag_13Hz_U.frontCmd1[1];
    airbag_13Hz_DW.pPrevDemoCmd[2] =
      airbag_13Hz_U.frontCmd1[2];
    airbag_13Hz_DW.pPendingDemoMode = 0.0F;
    airbag_13Hz_DW.pPendingDemoArg = 0.0F;
    airbag_13Hz_DW.pDemoHoldCycles = 0;
  } else {
    airbag_13Hz_DW.pSpineBiasSec = 0.0F;
    airbag_13Hz_DW.pSpineDir = 0.0F;
    airbag_13Hz_DW.pSpineActive = 0.0F;
    airbag_13Hz_DW.pSpineNeutralSec = 0.0F;
    airbag_13Hz_DW.pSpineActionTimer = 0.0F;
    airbag_13Hz_DW.pBumpDetectSec = 0.0F;
    airbag_13Hz_DW.pBumpClearSec = 0.0F;
    airbag_13Hz_DW.pBumpLatched = 0.0F;
    airbag_13Hz_DW.pBumpActionTimer = 0.0F;
    airbag_13Hz_DW.pHistoryValid = 0.0F;
    airbag_13Hz_DW.pForwardRefX = 0.0F;
    airbag_13Hz_DW.pForwardAge = 0.0F;
    airbag_13Hz_DW.pBackDropWindow = 0.0F;
    airbag_13Hz_DW.pSickPromptTimer = 0.0F;
    airbag_13Hz_DW.pBackPeakSum = 0.0F;
    airbag_13Hz_DW.pBackPeakAge = 0.0F;
    airbag_13Hz_DW.pSickEventCount = 0.0F;
    airbag_13Hz_DW.pSickEventGap = 0.0F;
    airbag_13Hz_DW.pSickCountAge = 0.0F;
    if ((airbag_13Hz_DW.pDemoHoldCycles <= 0) &&
        (airbag_13Hz_DW.pPendingDemoMode != 0.0F)) {
      if (airbag_13Hz_DW.pPendingDemoMode == 6.0F) {
        airbag_13Hz_DW.pDemoSpineSide =
          airbag_13Hz_DW.pPendingDemoArg;
        airbag_13Hz_DW.pDemoSpineTimer = 2.0F;
      } else if (airbag_13Hz_DW.pPendingDemoMode == 7.0F) {
        airbag_13Hz_DW.pDemoBumpTimer = 2.0F;
      } else if (airbag_13Hz_DW.pPendingDemoMode == 8.0F) {
        airbag_13Hz_DW.pDemoSickTimer = 2.0F;
      }

      airbag_13Hz_DW.pPendingDemoMode = 0.0F;
      airbag_13Hz_DW.pPendingDemoArg = 0.0F;
    }

    if ((((alpha == 6.0F) && (partCmd != 0.0F)) || (alpha == 7.0F) || (alpha ==
          8.0F)) && ((alpha != roundf(airbag_13Hz_DW.pPrevDemoCmd
           [0])) || (partCmd != roundf
                     (airbag_13Hz_DW.pPrevDemoCmd[1])))) {
      airbag_13Hz_DW.pDemoSpineTimer = 0.0F;
      airbag_13Hz_DW.pDemoSpineSide = 0.0F;
      airbag_13Hz_DW.pDemoBumpTimer = 0.0F;
      airbag_13Hz_DW.pDemoSickTimer = 0.0F;
      airbag_13Hz_DW.pPendingDemoMode = alpha;
      if (alpha == 6.0F) {
        if (partCmd < 0.0F) {
          airbag_13Hz_DW.pPendingDemoArg = -1.0F;
        } else {
          airbag_13Hz_DW.pPendingDemoArg = 1.0F;
        }
      } else {
        airbag_13Hz_DW.pPendingDemoArg = 0.0F;
      }

      airbag_13Hz_DW.pDemoHoldCycles = 1;
    }

    airbag_13Hz_DW.pPrevDemoCmd[0] =
      airbag_13Hz_U.frontCmd1[0];
    airbag_13Hz_DW.pPrevDemoCmd[1] =
      airbag_13Hz_U.frontCmd1[1];
    airbag_13Hz_DW.pPrevDemoCmd[2] =
      airbag_13Hz_U.frontCmd1[2];
    if (airbag_13Hz_DW.pDemoSpineTimer > 0.0F) {
      airbag_13Hz_Y.spineProtectActive1 = 1.0F;
      airbag_13Hz_Y.spineProtectSide1 =
        airbag_13Hz_DW.pDemoSpineSide;
      nz = 1;
      if (airbag_13Hz_DW.pDemoSpineSide < 0.0F) {
        rtb_healthSideWingLeftAction = 1;
      } else if (airbag_13Hz_DW.pDemoSpineSide > 0.0F) {
        rtb_healthSideWingRightAction = 1;
      }
    }

    if (airbag_13Hz_DW.pDemoBumpTimer > 0.0F) {
      airbag_13Hz_Y.bumpReliefActive1 = 1.0F;
      nz += 2;
      rtb_healthSideWingLeftAction = 1;
      rtb_healthSideWingRightAction = 1;
    }

    if (airbag_13Hz_DW.pDemoSickTimer > 0.0F) {
      airbag_13Hz_Y.motionSicknessActive1 = 1.0F;
      nz += 4;
      rtb_healthSideWingLeftAction = 1;
      rtb_healthSideWingRightAction = 1;
    }

    if (airbag_13Hz_DW.pDemoSpineTimer > 0.0F) {
      airbag_13Hz_DW.pDemoSpineTimer = fmaxf(0.0F,
        airbag_13Hz_DW.pDemoSpineTimer - 0.0769230798F);
    }

    if (airbag_13Hz_DW.pDemoBumpTimer > 0.0F) {
      airbag_13Hz_DW.pDemoBumpTimer = fmaxf(0.0F,
        airbag_13Hz_DW.pDemoBumpTimer - 0.0769230798F);
    }

    if (airbag_13Hz_DW.pDemoSickTimer > 0.0F) {
      airbag_13Hz_DW.pDemoSickTimer = fmaxf(0.0F,
        airbag_13Hz_DW.pDemoSickTimer - 0.0769230798F);
    }

    if (airbag_13Hz_DW.pDemoHoldCycles > 0) {
      airbag_13Hz_DW.pDemoHoldCycles--;
    }
  }

  airbag_13Hz_Y.deflation_time_out1 =
    airbag_13Hz_U.deflation_time1;
  alpha = airbag_13Hz_U.adoption_frequency1;
  adoptionFrequency = airbag_13Hz_U.welcomeSideWingTime1;
  adjustCmd = airbag_13Hz_U.welcomeLumbarTime1;
  partCmd = airbag_13Hz_U.welcomeHipTime1;
  baseInflationSeconds = airbag_13Hz_U.welcomeLegTime1;
  if (airbag_13Hz_U.deflation_time1 <= 0.0F) {
    airbag_13Hz_Y.deflation_time_out1 = 10.0F;
  }

  if (airbag_13Hz_U.adoption_frequency1 <= 0.0F) {
    alpha = 13.0F;
  }

  if (airbag_13Hz_U.welcomeSideWingTime1 <= 0.0F) {
    adoptionFrequency = 2.0F;
  }

  if (airbag_13Hz_U.welcomeLumbarTime1 <= 0.0F) {
    adjustCmd = 3.0F;
  }

  if (airbag_13Hz_U.welcomeHipTime1 <= 0.0F) {
    partCmd = 3.0F;
  }

  if (airbag_13Hz_U.welcomeLegTime1 <= 0.0F) {
    baseInflationSeconds = 2.0F;
  }

  airbag_13Hz_Y.inflation_time_out1 = ((adoptionFrequency +
    adjustCmd) + partCmd) + baseInflationSeconds;
  airbag_13Hz_Y.inflation_time1_out1 = fmaxf(0.0F,
    airbag_13Hz_U.inflation_time3);
  airbag_13Hz_Y.holding_time_out1 = fmaxf(0.0F,
    airbag_13Hz_U.holding_time1);
  airbag_13Hz_Y.deflation_time_out1 = fmaxf(0.0F,
    airbag_13Hz_Y.deflation_time_out1);
  alpha = fmaxf(1.0F, alpha);
  rtb_stateChanged = (rtb_adaptiveUnlocked == 1);
  manualNow = ((real32_T)rtb_isOccupied > 0.5F);
  longSitActive = (rtb_massageEnable >= 0.5F);
  newReason = (rtb_reasonCode != airbag_13Hz_DW.pPrevReasonCode);
  if ((newReason && (rtb_reasonCode == 4)) || ((rtb_reasonCode == 4) &&
       (airbag_13Hz_DW.mode != 4.0F))) {
    if (airbag_13Hz_DW.mode == 1.0F) {
      airbag_13Hz_DW.mode = 4.0F;
      airbag_13Hz_DW.elapsed_time = fmaxf(0.0F,
        airbag_13Hz_Y.deflation_time_out1 * alpha -
        airbag_13Hz_DW.elapsed_time);
    } else {
      airbag_13Hz_DW.mode = 4.0F;
      airbag_13Hz_DW.elapsed_time = 0.0F;
    }
  } else if (newReason && actionAllowed_tmp) {
    airbag_13Hz_DW.mode = 1.0F;
    airbag_13Hz_DW.elapsed_time = 0.0F;
  }

  newReason = (manualNow && rtb_stateChanged);
  actionAllowed_tmp = !longSitActive;
  living = (newReason && ((airbag_13Hz_DW.mode == 2.0F) ||
             (airbag_13Hz_DW.mode == 3.0F)) && actionAllowed_tmp);
  gapActive = (((real32_T)requestIdle > 0.5F) && (rtb_status[2] > 0.5F) &&
               ((!((real32_T)gapActive > 0.5F)) && (!(rtb_status[3] > 0.5F))) &&
               living);
  baseInflationSeconds = airbag_13Hz_U.backrestThreshold1;
  if (rtIsInfF(airbag_13Hz_U.backrestThreshold1) || rtIsNaNF
      (airbag_13Hz_U.backrestThreshold1)) {
    baseInflationSeconds = 2500.0F;
  } else if (airbag_13Hz_U.backrestThreshold1 <= 0.0F) {
    baseInflationSeconds = 2500.0F;
  }

  requestIdle = (airbag_13Hz_Y.backrestSum1 >=
                 baseInflationSeconds);
  if (healthLeftNow || (airbag_13Hz_DW.mode == 4.0F)) {
    airbag_13Hz_DW.pBackRelState = 0;
    airbag_13Hz_DW.pBackRelLostCount = 0;
    airbag_13Hz_DW.pBackRelTimer = 0.0F;
  } else {
    switch (airbag_13Hz_DW.pBackRelState) {
     case 0:
      if (requestIdle) {
        airbag_13Hz_DW.pBackRelState = 1;
      }
      break;

     case 1:
      if (requestIdle) {
        airbag_13Hz_DW.pBackRelLostCount = 0;
      } else {
        if (airbag_13Hz_DW.pBackRelLostCount <= 2147483646) {
          airbag_13Hz_DW.pBackRelLostCount++;
        }

        baseInflationSeconds = ceilf(alpha);
        if (baseInflationSeconds < 2.14748365E+9F) {
          i = (int32_T)baseInflationSeconds;
        } else {
          i = MAX_int32_T;
        }

        if (airbag_13Hz_DW.pBackRelLostCount >= i) {
          airbag_13Hz_DW.pBackRelState = 2;
          airbag_13Hz_DW.pBackRelLostCount = 0;
          airbag_13Hz_DW.pBackRelTimer = 0.0F;
        }
      }
      break;
    }
  }

  rtb_adaptiveUnlocked = 0;
  if (rtb_leftAction == 1) {
    rtb_adaptiveUnlocked = 3;
  } else if (rtb_leftAction == 2) {
    rtb_adaptiveUnlocked = 4;
  }

  i = 0;
  if (idx == 1) {
    i = 3;
  } else if (idx == 2) {
    i = 4;
  }

  SideWingleftGear = 0;
  if (xpageoffset == 1) {
    SideWingleftGear = 3;
  } else if (xpageoffset == 2) {
    SideWingleftGear = 4;
  }

  xpageoffset = 0;
  if (rtb_rightAction_b == 1) {
    xpageoffset = 3;
  } else if (rtb_rightAction_b == 2) {
    xpageoffset = 4;
  }

  rtb_rightAction_b = 0;
  if (rtb_action == 1) {
    rtb_rightAction_b = 3;
  } else if (rtb_action == 2) {
    rtb_rightAction_b = 4;
  }

  rtb_massageEnable = 0;
  if (rtb_healthSideWingLeftAction == 1) {
    rtb_massageEnable = 3;
  }

  rtb_leftAction = 0;
  if (rtb_healthSideWingRightAction == 1) {
    rtb_leftAction = 3;
  }

  healthLeftNow = (rtb_healthSideWingLeftAction == 1);
  rtb_isOccupied = (rtb_healthSideWingRightAction == 1);
  healthLeftEnded = ((airbag_13Hz_DW.pPrevHealthLeft > 0.5F) &&
                     (!healthLeftNow));
  healthRightEnded = ((airbag_13Hz_DW.pPrevHealthRight > 0.5F) &&
                      (!rtb_isOccupied));
  memset(&airbag_13Hz_Y.frame1[0], 0, 55U * sizeof(real32_T));
  airbag_13Hz_Y.frame1[0] = 31.0F;
  switch ((int32_T)airbag_13Hz_DW.mode) {
   case 1:
    rtb_adaptiveUnlocked = 3;
    baseInflationSeconds = adoptionFrequency * alpha;
    adjustCmd = adjustCmd * alpha + baseInflationSeconds;
    if (airbag_13Hz_DW.elapsed_time < baseInflationSeconds) {
      rtb_adaptiveUnlocked = 0;
    } else if (airbag_13Hz_DW.elapsed_time < adjustCmd) {
      rtb_adaptiveUnlocked = 1;
    } else if (airbag_13Hz_DW.elapsed_time < partCmd * alpha +
               adjustCmd) {
      rtb_adaptiveUnlocked = 2;
    }

    rtb_adaptiveUnlocked = (rtb_adaptiveUnlocked << 1) + 3;
    for (rtb_rightAction_b = 0; rtb_rightAction_b < 24; rtb_rightAction_b++) {
      idx = rtb_rightAction_b << 1;
      airbag_13Hz_Y.frame1[idx + 1] = (real32_T)rtb_rightAction_b
        + 1.0F;
      if (((rtb_rightAction_b + 1 == rtb_adaptiveUnlocked) || (rtb_rightAction_b
            == rtb_adaptiveUnlocked)) && rtb_stateChanged && manualNow) {
        airbag_13Hz_Y.frame1[idx + 2] = 3.0F;
      } else {
        airbag_13Hz_Y.frame1[idx + 2] = 0.0F;
      }
    }

    if (rtb_stateChanged && manualNow) {
      airbag_13Hz_DW.elapsed_time++;
      if (airbag_13Hz_DW.elapsed_time >=
          airbag_13Hz_Y.inflation_time_out1 * alpha) {
        airbag_13Hz_DW.mode = 2.0F;
        airbag_13Hz_DW.elapsed_time = 0.0F;
      }
    } else {
      airbag_13Hz_DW.elapsed_time = 0.0F;
    }
    break;

   case 2:
    for (rtb_action = 0; rtb_action < 24; rtb_action++) {
      idx = (rtb_action << 1) + 1;
      airbag_13Hz_Y.frame1[idx] = (real32_T)rtb_action + 1.0F;
      airbag_13Hz_Y.frame1[idx + 1] = 0.0F;
    }

    if ((real32_T)gapActive > 0.5F) {
      Zairbag_13Hz_applyAdaptiveGears(airbag_13Hz_Y.frame1,
        (real32_T)SideWingleftGear, (real32_T)xpageoffset, (real32_T)
        rtb_rightAction_b, (real32_T)rtb_adaptiveUnlocked, (real32_T)i);
      airbag_13Hz_DW.elapsed_time++;
      if (airbag_13Hz_DW.elapsed_time >=
          airbag_13Hz_Y.holding_time_out1 * alpha) {
        airbag_13Hz_DW.mode = 3.0F;
        airbag_13Hz_DW.elapsed_time = 0.0F;
      }
    }
    break;

   case 3:
    for (rtb_action = 0; rtb_action < 24; rtb_action++) {
      idx = (rtb_action << 1) + 1;
      airbag_13Hz_Y.frame1[idx] = (real32_T)rtb_action + 1.0F;
      airbag_13Hz_Y.frame1[idx + 1] = 0.0F;
    }

    if ((real32_T)gapActive > 0.5F) {
      Zairbag_13Hz_applyAdaptiveGears(airbag_13Hz_Y.frame1,
        (real32_T)SideWingleftGear, (real32_T)xpageoffset, (real32_T)
        rtb_rightAction_b, (real32_T)rtb_adaptiveUnlocked, (real32_T)i);
      airbag_13Hz_Y.frame1[14] = 3.0F;
      airbag_13Hz_Y.frame1[16] = 3.0F;
      airbag_13Hz_DW.elapsed_time++;
      if (airbag_13Hz_DW.elapsed_time >=
          airbag_13Hz_Y.inflation_time1_out1 * alpha) {
        airbag_13Hz_DW.mode = 2.0F;
        airbag_13Hz_DW.elapsed_time = 0.0F;
      }
    } else {
      airbag_13Hz_DW.mode = 2.0F;
      airbag_13Hz_DW.elapsed_time = 0.0F;
    }
    break;

   case 4:
    for (rtb_adaptiveUnlocked = 0; rtb_adaptiveUnlocked < 24;
         rtb_adaptiveUnlocked++) {
      idx = (rtb_adaptiveUnlocked << 1) + 1;
      airbag_13Hz_Y.frame1[idx] = (real32_T)rtb_adaptiveUnlocked +
        1.0F;
      airbag_13Hz_Y.frame1[idx + 1] = 4.0F;
    }

    airbag_13Hz_DW.elapsed_time++;
    if (airbag_13Hz_DW.elapsed_time >=
        airbag_13Hz_Y.deflation_time_out1 * alpha) {
      airbag_13Hz_DW.mode = 0.0F;
      airbag_13Hz_DW.elapsed_time = 0.0F;
    }
    break;

   default:
    airbag_13Hz_DW.mode = 0.0F;
    airbag_13Hz_DW.elapsed_time = 0.0F;
    for (rtb_adaptiveUnlocked = 0; rtb_adaptiveUnlocked < 24;
         rtb_adaptiveUnlocked++) {
      idx = (rtb_adaptiveUnlocked << 1) + 1;
      airbag_13Hz_Y.frame1[idx] = (real32_T)rtb_adaptiveUnlocked +
        1.0F;
      airbag_13Hz_Y.frame1[idx + 1] = 0.0F;
    }
    break;
  }

  if (newReason && actionAllowed_tmp && (airbag_13Hz_DW.mode !=
       4.0F)) {
    if (rtb_massageEnable != 0) {
      airbag_13Hz_Y.frame1[8] = (real32_T)rtb_massageEnable;
    }

    if (rtb_leftAction != 0) {
      airbag_13Hz_Y.frame1[6] = (real32_T)rtb_leftAction;
    }
  }

  if (airbag_13Hz_DW.mode != 4.0F) {
    if (healthLeftEnded) {
      airbag_13Hz_Y.frame1[8] = 0.0F;
    }

    if (healthRightEnded) {
      airbag_13Hz_Y.frame1[6] = 0.0F;
    }
  }

  if ((airbag_13Hz_DW.pRequest[0] > 0.5F) && (living &&
       ((airbag_13Hz_DW.mode == 2.0F) ||
        (airbag_13Hz_DW.mode == 3.0F)))) {
    if (airbag_13Hz_DW.pRequest[2] > 0.0F) {
      rtb_adaptiveUnlocked = 3;
    } else {
      rtb_adaptiveUnlocked = 4;
    }

    for (rtb_massageEnable = 0; rtb_massageEnable < 10; rtb_massageEnable++) {
      if (xtmp == 1.0F) {
        newReason = ((rtb_massageEnable == 0) || (rtb_massageEnable + 1 == 2));
      } else if (xtmp == 2.0F) {
        newReason = ((rtb_massageEnable + 1 == 3) || (rtb_massageEnable + 1 == 4));
      } else if (xtmp == 3.0F) {
        newReason = ((rtb_massageEnable + 1 == 5) || (rtb_massageEnable + 1 == 6));
      } else if (xtmp == 4.0F) {
        newReason = ((rtb_massageEnable + 1 == 7) || (rtb_massageEnable + 1 == 8));
      } else {
        newReason = ((xtmp == 5.0F) && ((rtb_massageEnable + 1 == 9) ||
          (rtb_massageEnable + 1 == 10)));
      }

      if ((xtmp == 0.0F) || newReason) {
        airbag_13Hz_Y.frame1[(rtb_massageEnable << 1) + 2] =
          (real32_T)rtb_adaptiveUnlocked;
      }
    }
  }

  if ((rtb_hipInflateRequest > 0.5F) && (airbag_13Hz_DW.mode !=
       1.0F) && (airbag_13Hz_DW.mode != 4.0F)) {
    airbag_13Hz_Y.frame1[14] = 3.0F;
    airbag_13Hz_Y.frame1[16] = 3.0F;
  }

  if (longSitActive && (airbag_13Hz_DW.mode != 1.0F) &&
      (airbag_13Hz_DW.mode != 4.0F)) {
    for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 10;
         rtb_hipInflateRequest++) {
      airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2] =
        0.0F;
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 14;
       rtb_hipInflateRequest++) {
    rtb_adaptiveUnlocked = ((rtb_hipInflateRequest + 10) << 1) + 2;
    switch (rtb_massageGears[rtb_hipInflateRequest]) {
     case 4:
      airbag_13Hz_Y.frame1[rtb_adaptiveUnlocked] = 4.0F;
      break;

     case 3:
      if (longSitActive && rtb_stateChanged &&
          (airbag_13Hz_DW.mode != 1.0F)) {
        airbag_13Hz_Y.frame1[rtb_adaptiveUnlocked] = 3.0F;
      }
      break;
    }
  }

  manualNow = false;
  newReason = false;
  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 24;
       rtb_hipInflateRequest++) {
    xtmp = airbag_13Hz_DW.pPrevGears[rtb_hipInflateRequest];
    manualNow = ((xtmp == 3.0F) || ((xtmp == 4.0F) || manualNow));
    newReason = ((airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1)
                  + 2] != xtmp) || newReason);
  }

  if (((!rtb_stateChanged) || healthLeftEnded || healthRightEnded || (manualNow &&
        newReason)) && (!(airbag_13Hz_DW.mode == 4.0F))) {
    for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 24;
         rtb_hipInflateRequest++) {
      airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2] =
        0.0F;
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 24;
       rtb_hipInflateRequest++) {
    airbag_13Hz_DW.pPrevGears[rtb_hipInflateRequest] =
      airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2];
  }

  switch (airbag_13Hz_DW.pBackRelState) {
   case 2:
    for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 6;
         rtb_hipInflateRequest++) {
      airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2] =
        0.0F;
    }

    airbag_13Hz_DW.pBackRelState = 3;
    airbag_13Hz_DW.pBackRelTimer = 0.0F;
    break;

   case 3:
    if (requestIdle || (airbag_13Hz_DW.pBackRelTimer >= 5.0F *
                        alpha)) {
      for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 6;
           rtb_hipInflateRequest++) {
        airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2] =
          0.0F;
      }

      airbag_13Hz_DW.pBackRelState = 0;
      airbag_13Hz_DW.pBackRelTimer = 0.0F;
    } else {
      for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 6;
           rtb_hipInflateRequest++) {
        airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2] =
          4.0F;
      }

      airbag_13Hz_DW.pBackRelTimer++;
    }
    break;
  }

  if (airbag_13Hz_DW.mode != 4.0F) {
    manualNow = false;
    newReason = false;
    for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 6;
         rtb_hipInflateRequest++) {
      xtmp =
        airbag_13Hz_DW.pPrevBackrestGears[rtb_hipInflateRequest];
      manualNow = ((xtmp == 3.0F) || ((xtmp == 4.0F) || manualNow));
      newReason = ((airbag_13Hz_Y.frame1[(rtb_hipInflateRequest <<
        1) + 2] != xtmp) || newReason);
    }

    if (manualNow && newReason) {
      for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 6;
           rtb_hipInflateRequest++) {
        airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2] =
          0.0F;
      }
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 6;
       rtb_hipInflateRequest++) {
    airbag_13Hz_DW.pPrevBackrestGears[rtb_hipInflateRequest] =
      airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2];
  }

  airbag_13Hz_Y.frame1[49] = 0.0F;
  airbag_13Hz_Y.frame1[50] = 0.0F;
  airbag_13Hz_Y.frame1[51] = 170.0F;
  airbag_13Hz_Y.frame1[52] = 85.0F;
  airbag_13Hz_Y.frame1[53] = 3.0F;
  airbag_13Hz_Y.frame1[54] = 153.0F;
  airbag_13Hz_DW.pPrevHealthLeft = healthLeftNow;
  airbag_13Hz_DW.pPrevHealthRight = rtb_isOccupied;
  airbag_13Hz_DW.pPrevReasonCode = rtb_reasonCode;
  if (rtb_nvmWrite[0] == 1.0F) {
    airbag_13Hz_DW.UnitDelay2_DSTATE[0] = 1.0F;
    for (i = 0; i < 14; i++) {
      airbag_13Hz_DW.UnitDelay2_DSTATE[i + 1] = rtb_nvmWrite[i + 1];
    }
  } else if (rtb_nvmWrite[0] == 2.0F) {
    for (i = 0; i < 15; i++) {
      airbag_13Hz_DW.UnitDelay2_DSTATE[i] = 0.0F;
    }
  } else if (rtb_nvmWrite[0] == 3.0F) {
    airbag_13Hz_DW.UnitDelay2_DSTATE[14] = (real32_T)
      (airbag_13Hz_DW.pAdaptiveOff > 0.5F);
  }

  airbag_13Hz_Y.healthReasonCode1 = (real32_T)nz;
  airbag_13Hz_Y.thresholdPassed1 = (real32_T)backrestData1_tmp;
  airbag_13Hz_Y.backTotalThreshold_out1 =
    airbag_13Hz_U.backTotalThreshold1;
  airbag_13Hz_Y.reasonCode1 = rtb_reasonCode;
  airbag_13Hz_Y.isLivingRaw1 =
    airbag_13Hz_DW.latestRaw;
  airbag_13Hz_Y.detectionTriggered1 = trigNow;
  airbag_13Hz_Y.queueLength1 = (real32_T)
    airbag_13Hz_DW.livingQueueLen;
  airbag_13Hz_Y.detectorEnabled_out1 = 1.0F;
  airbag_13Hz_Y.isLiving1 = (real32_T)(voteCode == 3);
  airbag_13Hz_Y.isStatic1 = (real32_T)(voteCode == 2);
  airbag_13Hz_Y.isPending1 = (real32_T)(voteCode == 1);
  airbag_13Hz_Y.isFullSeat1 = (real32_T)
    (airbag_13Hz_DW.pState_i == 2);
  airbag_13Hz_Y.offCounter1 = 0.0F;
  airbag_13Hz_Y.resetCounter1 = 0.0F;
  airbag_13Hz_Y.backrestLostCounter1 = (real32_T)
    airbag_13Hz_DW.pBackrestLostCounter;
  memcpy(&airbag_13Hz_Y.frame_data_out1[0],
         &airbag_13Hz_U.frame_data1[0], 92U * sizeof(real32_T));
  airbag_13Hz_DW.UnitDelay3_DSTATE[0] =
    airbag_13Hz_Y.lumbarRatio1;
  airbag_13Hz_DW.UnitDelay3_DSTATE[1] =
    airbag_13Hz_Y.wingRatio1;
  airbag_13Hz_DW.UnitDelay3_DSTATE[2] =
    airbag_13Hz_Y.leftLegRatio1;
  airbag_13Hz_DW.UnitDelay3_DSTATE[3] =
    airbag_13Hz_Y.rightLegRatio1;
}

void airbag_13Hz_initialize(void)
{
  {
    int32_T i;
    static const real32_T tmp[8] = { 0.8F, 0.65F, 0.7F, 1.3F, 0.65F, 0.76F,
      0.65F, 0.76F };

    airbag_13Hz_DW.noiseBaseline = 0.33F;
    airbag_13Hz_DW.noiseDev = 0.1F;
    for (i = 0; i < 8; i++) {
      airbag_13Hz_DW.pThresholds[i] = tmp[i];
    }
  }
}

void airbag_13Hz_terminate(void)
{
}
