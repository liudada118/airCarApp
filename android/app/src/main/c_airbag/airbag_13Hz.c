/*
 * Academic License - for use in teaching, academic research, and meeting
 * course requirements at degree granting institutions only.  Not for
 * government, commercial, or other organizational use.
 *
 * File: airbag_13Hz.c
 *
 * Code generated for Simulink model 'airbag_13Hz'.
 *
 * Model version                  : 1.241
 * Simulink Coder version         : 25.2 (R2025b) 28-Jul-2025
 * C/C++ source code generated on : Sat Aug  1 17:49:49 2026
 *
 * Target selection: ert.tlc
 * Embedded hardware selection: NXP->Cortex-M4
 * Code generation objectives: Unspecified
 * Validation result: Not run
 */

#include "airbag_13Hz.h"
#include "rtwtypes.h"
#include <string.h>
#include <math.h>
#include "rt_nonfinite.h"
#include "airbag_13Hz_private.h"

/* Block states (default storage) */
DW_airbag_13Hz_T airbag_13Hz_DW;

/* External inputs (root inport signals with default storage) */
ExtU_airbag_13Hz_T airbag_13Hz_U;

/* External outputs (root outports fed by signals with default storage) */
ExtY_airbag_13Hz_T airbag_13Hz_Y;

/* Real-time model */
static RT_MODEL_airbag_13Hz_T airbag_13Hz_M_;
RT_MODEL_airbag_13Hz_T *const airbag_13Hz_M = &airbag_13Hz_M_;

/* Forward declaration for local functions */
static void airba_calculatePressureFeatures(const real32_T matrixIn[56],
  real32_T threshold, real32_T *originalSum, real32_T *filteredSum);
static real32_T airbag_13Hz_sum(const real32_T x_data[], const int32_T *x_size);
static real32_T airbag_13Hz_mean(const real32_T x_data[], const int32_T *x_size);
static int8_T airbag__updateLivingStatusQueue(const boolean_T queueValues_data[],
  const int32_T queueValues_size[2], boolean_T inEnabledState);
static real32_T airbag_13Hz_directionOf(real32_T b_value);
static boolean_T airbag_13Hz_allFinitePositive(const real32_T values[8]);
static boolean_T airbag_13Hz_any(const boolean_T x[3]);
static void airbag_13Hz_makeThresholds(real32_T lumbarRatio, real32_T wingRatio,
  real32_T leftLegRatio, real32_T rightLegRatio, real32_T thresholds[8]);
static void airbag_13Hz_applyAdaptiveGears(real32_T frame[55], real32_T
  leftWingGear, real32_T rightWingGear, real32_T lumbarGear, real32_T
  leftLegGear, real32_T rightLegGear);

/* Function for MATLAB Function: '<Root>/入座处理1' */
static void airba_calculatePressureFeatures(const real32_T matrixIn[56],
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

/* Function for MATLAB Function: '<Root>/活体检测1' */
static real32_T airbag_13Hz_sum(const real32_T x_data[], const int32_T *x_size)
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

/* Function for MATLAB Function: '<Root>/活体检测1' */
static real32_T airbag_13Hz_mean(const real32_T x_data[], const int32_T *x_size)
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

/* Function for MATLAB Function: '<Root>/活体检测1' */
static int8_T airbag__updateLivingStatusQueue(const boolean_T queueValues_data[],
  const int32_T queueValues_size[2], boolean_T inEnabledState)
{
  int8_T statusCode;
  if (!inEnabledState) {
    statusCode = 0;
  } else if (queueValues_size[1] < 5) {
    statusCode = 1;
  } else if ((((queueValues_data[0] + queueValues_data[1]) + queueValues_data[2])
              + queueValues_data[3]) + queueValues_data[4] >= 3) {
    statusCode = 3;
  } else {
    statusCode = 2;
  }

  return statusCode;
}

real32_T rt_roundf_snf(real32_T u)
{
  real32_T y;
  if (fabsf(u) < 8.388608E+6F) {
    if (u >= 0.5F) {
      y = floorf(u + 0.5F);
    } else if (u > -0.5F) {
      y = u * 0.0F;
    } else {
      y = ceilf(u - 0.5F);
    }
  } else {
    y = u;
  }

  return y;
}

/* Function for MATLAB Function: '<Root>/品味系数1' */
static real32_T airbag_13Hz_directionOf(real32_T b_value)
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

/* Function for MATLAB Function: '<Root>/品味系数1' */
static boolean_T airbag_13Hz_allFinitePositive(const real32_T values[8])
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

/* Function for MATLAB Function: '<Root>/品味系数1' */
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

/* Function for MATLAB Function: '<Root>/品味系数1' */
static void airbag_13Hz_makeThresholds(real32_T lumbarRatio, real32_T wingRatio,
  real32_T leftLegRatio, real32_T rightLegRatio, real32_T thresholds[8])
{
  real32_T leftCenter;
  real32_T lumbarCenter;
  real32_T rightCenter;
  real32_T wingCenter;
  lumbarCenter = lumbarRatio;
  if (rtIsInfF(lumbarRatio) || rtIsNaNF(lumbarRatio)) {
    lumbarCenter = 1.0999999F;
  } else if (lumbarRatio <= 0.0F) {
    lumbarCenter = 1.0999999F;
  }

  wingCenter = wingRatio;
  if (rtIsInfF(wingRatio) || rtIsNaNF(wingRatio)) {
    wingCenter = 1.0F;
  } else if (wingRatio <= 0.0F) {
    wingCenter = 1.0F;
  }

  leftCenter = leftLegRatio;
  if (rtIsInfF(leftLegRatio) || rtIsNaNF(leftLegRatio)) {
    leftCenter = 0.6F;
  } else if (leftLegRatio <= 0.0F) {
    leftCenter = 0.6F;
  }

  rightCenter = rightLegRatio;
  if (rtIsInfF(rightLegRatio) || rtIsNaNF(rightLegRatio)) {
    rightCenter = 0.8F;
  } else if (rightLegRatio <= 0.0F) {
    rightCenter = 0.8F;
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

/* Function for MATLAB Function: '<Root>/气囊控制协议1' */
static void airbag_13Hz_applyAdaptiveGears(real32_T frame[55], real32_T
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

/* Model step function */
void airbag_13Hz_step(void)
{
  real_T r;
  int32_T LumbarlumbarGear;
  int32_T i;
  int32_T idx;
  int32_T newWriteIndex;
  int32_T nvmCmd;
  int32_T rtb_healthSideWingLeftAction;
  int32_T rtb_healthSideWingRightAction;
  int32_T rtb_hipInflateRequest;
  int32_T rtb_isStable;
  int32_T rtb_leftAction;
  int32_T rtb_leftAction_h;
  int32_T rtb_massageEnable;
  int32_T rtb_rightAction;
  int32_T xpageoffset;
  real32_T backrestMatrix[56];
  real32_T backrestMatrix_data[56];
  real32_T e[56];
  real32_T cushionMatrix[48];
  real32_T rtb_nvmWrite[15];
  real32_T tmp_data_1[13];
  real32_T rtb_status[9];
  real32_T tmp[8];
  real32_T c_y[6];
  real32_T addedEdgeLength;
  real32_T adjustCmd;
  real32_T adoptionFrequency;
  real32_T b_pressure;
  real32_T b_weightedY;
  real32_T baseInflationSeconds;
  real32_T bumpRangeMax;
  real32_T bumpRmsMax;
  real32_T deflationSeconds;
  real32_T dyNew;
  real32_T normalizeScale;
  real32_T pathIncrement;
  real32_T rtb_avg_velocity;
  real32_T rtb_backrest_cop_y;
  real32_T rtb_cop_x;
  real32_T rtb_cushionSum_a;
  real32_T rtb_delta_x;
  real32_T rtb_delta_y;
  real32_T rtb_rms_displacement;
  real32_T spineDeadband;
  real32_T spineThreshold;
  real32_T xtmp;
  uint32_T qY;
  uint32_T sitThresholdFrames;
  int8_T tmp_data[56];
  int8_T tmp_data_0[56];
  int8_T rtb_massageGears[14];
  int8_T d;
  int8_T microState;
  int8_T rtb_reasonCode;
  boolean_T b_validMask[56];
  boolean_T validMask[56];
  boolean_T queueValues_data[5];
  boolean_T tmp_0[3];
  boolean_T b_requestIdle_tmp;
  boolean_T gapActive;
  boolean_T isStill;
  boolean_T living;
  boolean_T manualNow;
  boolean_T newReason;
  boolean_T requestIdle;
  boolean_T rtb_isOccupied;
  boolean_T rtb_stateChanged;
  static const int8_T d_0[5] = { 3, 5, 3, 5, 6 };

  static const int8_T c[5] = { 1, 1, 2, 2, 2 };

  static const int8_T f[5] = { 4, 6, 3, 5, 6 };

  static const int8_T e_0[5] = { 1, 1, 3, 3, 3 };

  static const int8_T f_0[4] = { 0, 1, 6, 7 };

  static const int8_T d_1[5] = { 6, 6, 9, 9, 9 };

  static const real32_T e_1[8] = { 1.3F, 0.9F, 0.7F, 1.3F, 0.35F, 0.85F, 0.5F,
    1.1F };

  static const int8_T g[5] = { 1, 0, -1, 5, 4 };

  static const int8_T h[5] = { 2, 2, 3, 3, 3 };

  int32_T queueValues_size[2];
  boolean_T exitg1;
  boolean_T guard1;
  boolean_T guard2;
  boolean_T tmp_1;

  /* MATLAB Function: '<Root>/矩阵处理1' incorporates:
   *  Inport: '<Root>/frame_data1'
   */
  memset(&backrestMatrix[0], 0, 56U * sizeof(real32_T));
  memset(&cushionMatrix[0], 0, 48U * sizeof(real32_T));
  backrestMatrix[0] = airbag_13Hz_U.frame_data1[0];
  backrestMatrix[49] = airbag_13Hz_U.frame_data1[4];
  backrestMatrix[1] = airbag_13Hz_U.frame_data1[1];
  backrestMatrix[50] = airbag_13Hz_U.frame_data1[5];
  backrestMatrix[2] = airbag_13Hz_U.frame_data1[2];
  backrestMatrix[51] = airbag_13Hz_U.frame_data1[6];
  backrestMatrix[3] = airbag_13Hz_U.frame_data1[3];
  backrestMatrix[52] = airbag_13Hz_U.frame_data1[7];
  for (i = 0; i < 6; i++) {
    for (newWriteIndex = 0; newWriteIndex < 5; newWriteIndex++) {
      backrestMatrix[newWriteIndex + 7 * (i + 1)] = (&airbag_13Hz_U.frame_data1
        [8])[6 * newWriteIndex + i];
    }
  }

  for (i = 0; i < 8; i++) {
    /* MATLAB Function: '<Root>/矩阵处理1' incorporates:
     *  Inport: '<Root>/frame_data1'
     */
    tmp[i] = airbag_13Hz_U.frame_data1[i + 38];
  }

  /* MATLAB Function: '<Root>/矩阵处理1' incorporates:
   *  Inport: '<Root>/frame_data1'
   */
  for (i = 0; i < 4; i++) {
    rtb_hipInflateRequest = (i + 2) * 7;
    backrestMatrix[rtb_hipInflateRequest + 5] = tmp[i];
    backrestMatrix[rtb_hipInflateRequest + 6] = tmp[i + 4];
  }

  for (i = 0; i < 5; i++) {
    cushionMatrix[i] = airbag_13Hz_U.frame_data1[i + 46];
    cushionMatrix[i + 42] = airbag_13Hz_U.frame_data1[i + 51];
  }

  for (i = 0; i < 6; i++) {
    for (newWriteIndex = 0; newWriteIndex < 6; newWriteIndex++) {
      cushionMatrix[newWriteIndex + 6 * (i + 1)] = (&airbag_13Hz_U.frame_data1
        [56])[6 * newWriteIndex + i];
    }
  }

  for (nvmCmd = 0; nvmCmd < 8; nvmCmd++) {
    xtmp = backrestMatrix[7 * nvmCmd];
    rtb_hipInflateRequest = 7 * nvmCmd + 6;
    backrestMatrix[7 * nvmCmd] = backrestMatrix[rtb_hipInflateRequest];
    backrestMatrix[rtb_hipInflateRequest] = xtmp;
    newWriteIndex = 7 * nvmCmd + 1;
    xtmp = backrestMatrix[newWriteIndex];
    rtb_hipInflateRequest = 7 * nvmCmd + 5;
    backrestMatrix[newWriteIndex] = backrestMatrix[rtb_hipInflateRequest];
    backrestMatrix[rtb_hipInflateRequest] = xtmp;
    newWriteIndex = 7 * nvmCmd + 2;
    xtmp = backrestMatrix[newWriteIndex];
    rtb_hipInflateRequest = 7 * nvmCmd + 4;
    backrestMatrix[newWriteIndex] = backrestMatrix[rtb_hipInflateRequest];
    backrestMatrix[rtb_hipInflateRequest] = xtmp;
  }

  for (nvmCmd = 0; nvmCmd < 4; nvmCmd++) {
    for (newWriteIndex = 0; newWriteIndex < 6; newWriteIndex++) {
      rtb_massageEnable = 6 * nvmCmd + newWriteIndex;
      xtmp = cushionMatrix[rtb_massageEnable];
      rtb_hipInflateRequest = (7 - nvmCmd) * 6 + newWriteIndex;
      cushionMatrix[rtb_massageEnable] = cushionMatrix[rtb_hipInflateRequest];
      cushionMatrix[rtb_hipInflateRequest] = xtmp;
    }
  }

  for (nvmCmd = 0; nvmCmd < 8; nvmCmd++) {
    xtmp = cushionMatrix[6 * nvmCmd];
    rtb_hipInflateRequest = 6 * nvmCmd + 5;
    cushionMatrix[6 * nvmCmd] = cushionMatrix[rtb_hipInflateRequest];
    cushionMatrix[rtb_hipInflateRequest] = xtmp;
    newWriteIndex = 6 * nvmCmd + 1;
    xtmp = cushionMatrix[newWriteIndex];
    rtb_hipInflateRequest = 6 * nvmCmd + 4;
    cushionMatrix[newWriteIndex] = cushionMatrix[rtb_hipInflateRequest];
    cushionMatrix[rtb_hipInflateRequest] = xtmp;
    newWriteIndex = 6 * nvmCmd + 2;
    xtmp = cushionMatrix[newWriteIndex];
    rtb_hipInflateRequest = 6 * nvmCmd + 3;
    cushionMatrix[newWriteIndex] = cushionMatrix[rtb_hipInflateRequest];
    cushionMatrix[rtb_hipInflateRequest] = xtmp;
  }

  for (newWriteIndex = 0; newWriteIndex < 56; newWriteIndex++) {
    if (backrestMatrix[newWriteIndex] >= 250.0F) {
      backrestMatrix[newWriteIndex] = airbag_13Hz_DW.pPrevB[newWriteIndex];
    }
  }

  for (newWriteIndex = 0; newWriteIndex < 48; newWriteIndex++) {
    if (cushionMatrix[newWriteIndex] >= 250.0F) {
      cushionMatrix[newWriteIndex] = airbag_13Hz_DW.pPrevC[newWriteIndex];
    }
  }

  if (airbag_13Hz_DW.pDone <= 0.5F) {
    isStill = true;
    for (newWriteIndex = 0; newWriteIndex < 56; newWriteIndex++) {
      isStill = ((!(fabsf(backrestMatrix[newWriteIndex] -
                          airbag_13Hz_DW.pPrevB[newWriteIndex]) >= 8.0F)) &&
                 isStill);
    }

    for (newWriteIndex = 0; newWriteIndex < 48; newWriteIndex++) {
      isStill = ((!(fabsf(cushionMatrix[newWriteIndex] -
                          airbag_13Hz_DW.pPrevC[newWriteIndex]) >= 8.0F)) &&
                 isStill);
    }

    if (isStill) {
      airbag_13Hz_DW.pStable++;
    } else {
      airbag_13Hz_DW.pStable = 0.0F;
    }

    if (airbag_13Hz_DW.pStable >= 26.0F) {
      memcpy(&airbag_13Hz_DW.pBaseB[0], &backrestMatrix[0], 56U * sizeof
             (real32_T));
      memcpy(&airbag_13Hz_DW.pBaseC[0], &cushionMatrix[0], 48U * sizeof(real32_T));
      airbag_13Hz_DW.pDone = 1.0F;
    }
  }

  memcpy(&airbag_13Hz_DW.pPrevB[0], &backrestMatrix[0], 56U * sizeof(real32_T));
  memcpy(&airbag_13Hz_DW.pPrevC[0], &cushionMatrix[0], 48U * sizeof(real32_T));
  if (airbag_13Hz_DW.pDone > 0.5F) {
    for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 56;
         rtb_hipInflateRequest++) {
      xtmp = backrestMatrix[rtb_hipInflateRequest] -
        airbag_13Hz_DW.pBaseB[rtb_hipInflateRequest];
      backrestMatrix[rtb_hipInflateRequest] = xtmp;
      airbag_13Hz_Y.backrestData1[rtb_hipInflateRequest] = fmaxf(0.0F, xtmp);
    }

    for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 48;
         rtb_hipInflateRequest++) {
      xtmp = cushionMatrix[rtb_hipInflateRequest] -
        airbag_13Hz_DW.pBaseC[rtb_hipInflateRequest];
      cushionMatrix[rtb_hipInflateRequest] = xtmp;
      airbag_13Hz_Y.cushionData1[rtb_hipInflateRequest] = fmaxf(0.0F, xtmp);
    }
  } else {
    memset(&airbag_13Hz_Y.backrestData1[0], 0, 56U * sizeof(real32_T));
    memset(&airbag_13Hz_Y.cushionData1[0], 0, 48U * sizeof(real32_T));
  }

  for (i = 0; i < 6; i++) {
    airbag_13Hz_Y.cushionData1[i] = 0.0F;
    airbag_13Hz_Y.cushionData1[i + 42] = 0.0F;
  }

  for (nvmCmd = 0; nvmCmd < 5; nvmCmd++) {
    i = ((d_0[nvmCmd] - 1) * 6 + c[nvmCmd]) - 1;
    baseInflationSeconds = airbag_13Hz_Y.cushionData1[i];
    newWriteIndex = ((f[nvmCmd] - 1) * 6 + e_0[nvmCmd]) - 1;
    xtmp = airbag_13Hz_Y.cushionData1[newWriteIndex];
    if (baseInflationSeconds >= xtmp) {
      airbag_13Hz_Y.cushionData1[i] = fminf(baseInflationSeconds, xtmp) * 0.5F +
        fmaxf(baseInflationSeconds, xtmp) * 0.5F;
    } else {
      airbag_13Hz_Y.cushionData1[newWriteIndex] = fminf(baseInflationSeconds,
        xtmp) * 0.5F + fmaxf(baseInflationSeconds, xtmp) * 0.5F;
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 56;
       rtb_hipInflateRequest++) {
    if (airbag_13Hz_Y.backrestData1[rtb_hipInflateRequest] < 5.0F) {
      airbag_13Hz_Y.backrestData1[rtb_hipInflateRequest] = 0.0F;
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 48;
       rtb_hipInflateRequest++) {
    if (airbag_13Hz_Y.cushionData1[rtb_hipInflateRequest] < 5.0F) {
      airbag_13Hz_Y.cushionData1[rtb_hipInflateRequest] = 0.0F;
    }
  }

  /* MATLAB Function: '<Root>/入座处理1' incorporates:
   *  Inport: '<Root>/ cushionThreshold1'
   *  Inport: '<Root>/backrestThreshold1'
   *  Inport: '<Root>/pointThreshold1'
   *  Inport: '<Root>/resetFlag1'
   *  MATLAB Function: '<Root>/矩阵处理1'
   */
  xtmp = airbag_13Hz_U.pointThreshold1;
  if (rtIsInfF(airbag_13Hz_U.pointThreshold1) || rtIsNaNF
      (airbag_13Hz_U.pointThreshold1)) {
    xtmp = 20.0F;
  } else if (airbag_13Hz_U.pointThreshold1 <= 0.0F) {
    xtmp = 20.0F;
  }

  if ((!airbag_13Hz_DW.pState_not_empty) || airbag_13Hz_U.resetFlag1) {
    airbag_13Hz_DW.pState_i = 0;
    airbag_13Hz_DW.pState_not_empty = true;
    airbag_13Hz_DW.pOffCounter = 0;
    airbag_13Hz_DW.pResetCounter = 0;
    airbag_13Hz_DW.pBackrestLostCounter = 0;
  }

  memset(&backrestMatrix[0], 0, 56U * sizeof(real32_T));
  for (i = 0; i < 8; i++) {
    for (newWriteIndex = 0; newWriteIndex < 6; newWriteIndex++) {
      backrestMatrix[newWriteIndex + 7 * i] = airbag_13Hz_Y.cushionData1[6 * i +
        newWriteIndex];
    }
  }

  airba_calculatePressureFeatures(backrestMatrix, xtmp, &normalizeScale,
    &airbag_13Hz_Y.cushionSum1);
  airba_calculatePressureFeatures(airbag_13Hz_Y.backrestData1, xtmp,
    &normalizeScale, &airbag_13Hz_Y.backrestSum1);
  microState = airbag_13Hz_DW.pState_i;
  rtb_reasonCode = 0;
  switch (airbag_13Hz_DW.pState_i) {
   case 0:
    if (airbag_13Hz_Y.cushionSum1 >= airbag_13Hz_U.cushionThreshold1) {
      airbag_13Hz_DW.pOffCounter = 0;
      airbag_13Hz_DW.pResetCounter = 0;
      airbag_13Hz_DW.pBackrestLostCounter = 0;
      if (airbag_13Hz_Y.backrestSum1 >= airbag_13Hz_U.backrestThreshold1) {
        microState = 2;
        rtb_reasonCode = 2;
      } else {
        microState = 1;
        rtb_reasonCode = 1;
      }
    }
    break;

   case 1:
    if ((airbag_13Hz_Y.cushionSum1 >= airbag_13Hz_U.cushionThreshold1) &&
        (airbag_13Hz_Y.backrestSum1 >= airbag_13Hz_U.backrestThreshold1)) {
      microState = 2;
      airbag_13Hz_DW.pOffCounter = 0;
      airbag_13Hz_DW.pBackrestLostCounter = 0;
      rtb_reasonCode = 3;
    } else if (airbag_13Hz_Y.cushionSum1 < airbag_13Hz_U.cushionThreshold1) {
      if (airbag_13Hz_DW.pOffCounter > 2147483646) {
        airbag_13Hz_DW.pOffCounter = MAX_int32_T;
      } else {
        airbag_13Hz_DW.pOffCounter++;
      }

      if (airbag_13Hz_DW.pOffCounter >= 14) {
        microState = 3;
        airbag_13Hz_DW.pOffCounter = 0;
        airbag_13Hz_DW.pResetCounter = 0;
        rtb_reasonCode = 4;
      }
    } else {
      airbag_13Hz_DW.pOffCounter = 0;
    }
    break;

   case 2:
    if (airbag_13Hz_Y.backrestSum1 < airbag_13Hz_U.backrestThreshold1) {
      if (airbag_13Hz_DW.pBackrestLostCounter > 2147483646) {
        airbag_13Hz_DW.pBackrestLostCounter = MAX_int32_T;
      } else {
        airbag_13Hz_DW.pBackrestLostCounter++;
      }

      if (airbag_13Hz_DW.pBackrestLostCounter >= 13) {
        microState = 1;
        airbag_13Hz_DW.pBackrestLostCounter = 0;
        airbag_13Hz_DW.pOffCounter = 0;
        rtb_reasonCode = 5;
      }
    } else {
      airbag_13Hz_DW.pBackrestLostCounter = 0;
    }

    if (airbag_13Hz_Y.cushionSum1 < airbag_13Hz_U.cushionThreshold1) {
      if (airbag_13Hz_DW.pOffCounter > 2147483646) {
        airbag_13Hz_DW.pOffCounter = MAX_int32_T;
      } else {
        airbag_13Hz_DW.pOffCounter++;
      }

      if (airbag_13Hz_DW.pOffCounter >= 14) {
        microState = 3;
        airbag_13Hz_DW.pOffCounter = 0;
        airbag_13Hz_DW.pResetCounter = 0;
        rtb_reasonCode = 4;
      }
    } else {
      airbag_13Hz_DW.pOffCounter = 0;
    }
    break;

   case 3:
    if (airbag_13Hz_Y.cushionSum1 >= airbag_13Hz_U.cushionThreshold1) {
      airbag_13Hz_DW.pResetCounter = 0;
      airbag_13Hz_DW.pOffCounter = 0;
      airbag_13Hz_DW.pBackrestLostCounter = 0;
      if (airbag_13Hz_Y.backrestSum1 >= airbag_13Hz_U.backrestThreshold1) {
        microState = 2;
        rtb_reasonCode = 8;
      } else {
        microState = 1;
        rtb_reasonCode = 7;
      }
    } else if (airbag_13Hz_DW.pResetCounter >= 130) {
      microState = 0;
      airbag_13Hz_DW.pResetCounter = 0;
      rtb_reasonCode = 6;
    } else {
      airbag_13Hz_DW.pResetCounter++;
    }
    break;
  }

  rtb_stateChanged = (airbag_13Hz_DW.pState_i != microState);
  airbag_13Hz_DW.pState_i = microState;
  rtb_isOccupied = ((airbag_13Hz_DW.pState_i == 1) || (airbag_13Hz_DW.pState_i ==
    2));

  /* MATLAB Function: '<Root>/活体检测1' incorporates:
   *  Inport: '<Root>/resetFlag1'
   *  Inport: '<Root>/sadNormalizeScaleIn1'
   *  Inport: '<Root>/sadThresholdIn1'
   *  MATLAB Function: '<Root>/入座处理1'
   *  MATLAB Function: '<Root>/矩阵处理1'
   */
  if (airbag_13Hz_U.sadNormalizeScaleIn1 <= 0.0F) {
    normalizeScale = 2.0F;
  } else {
    normalizeScale = airbag_13Hz_U.sadNormalizeScaleIn1;
  }

  if (!airbag_13Hz_DW.frameCount_not_empty) {
    memcpy(&airbag_13Hz_DW.prevCushion[0], &airbag_13Hz_Y.cushionData1[0], 48U *
           sizeof(real32_T));
    memcpy(&airbag_13Hz_DW.prevBackrest[0], &airbag_13Hz_Y.backrestData1[0], 56U
           * sizeof(real32_T));
    for (i = 0; i < 13; i++) {
      airbag_13Hz_DW.sadHistCushion[i] = 0.0F;
      airbag_13Hz_DW.sadHistBackrest[i] = 0.0F;
    }

    airbag_13Hz_DW.sadCount = 0.0;
    airbag_13Hz_DW.frameCount = 0.0;
    airbag_13Hz_DW.frameCount_not_empty = true;
    for (i = 0; i < 5; i++) {
      airbag_13Hz_DW.livingQueue[i] = false;
    }

    airbag_13Hz_DW.livingQueueLen = 0.0;
    airbag_13Hz_DW.latestRaw = false;
    airbag_13Hz_DW.latestConfidence = 0.0F;
    airbag_13Hz_DW.unlocked = false;
    airbag_13Hz_DW.sessionLivingLatched = false;
    airbag_13Hz_DW.sessionFrames = 0.0F;
    airbag_13Hz_DW.staticStreak = 0.0F;
  } else if (airbag_13Hz_U.resetFlag1) {
    memcpy(&airbag_13Hz_DW.prevCushion[0], &airbag_13Hz_Y.cushionData1[0], 48U *
           sizeof(real32_T));
    memcpy(&airbag_13Hz_DW.prevBackrest[0], &airbag_13Hz_Y.backrestData1[0], 56U
           * sizeof(real32_T));
    for (i = 0; i < 13; i++) {
      airbag_13Hz_DW.sadHistCushion[i] = 0.0F;
      airbag_13Hz_DW.sadHistBackrest[i] = 0.0F;
    }

    airbag_13Hz_DW.sadCount = 0.0;
    airbag_13Hz_DW.frameCount = 0.0;
    for (i = 0; i < 5; i++) {
      airbag_13Hz_DW.livingQueue[i] = false;
    }

    airbag_13Hz_DW.livingQueueLen = 0.0;
    airbag_13Hz_DW.latestRaw = false;
    airbag_13Hz_DW.latestConfidence = 0.0F;
    airbag_13Hz_DW.unlocked = false;
    airbag_13Hz_DW.sessionLivingLatched = false;
    airbag_13Hz_DW.sessionFrames = 0.0F;
    airbag_13Hz_DW.staticStreak = 0.0F;
  }

  airbag_13Hz_DW.frameCount++;
  memset(&backrestMatrix[0], 0, 56U * sizeof(real32_T));
  for (i = 0; i < 56; i++) {
    validMask[i] = false;
  }

  for (newWriteIndex = 0; newWriteIndex < 48; newWriteIndex++) {
    airbag_13Hz_DW.prevCushion[newWriteIndex] =
      airbag_13Hz_Y.cushionData1[newWriteIndex] -
      airbag_13Hz_DW.prevCushion[newWriteIndex];
    cushionMatrix[newWriteIndex] = fabsf
      (airbag_13Hz_DW.prevCushion[newWriteIndex]);
  }

  for (i = 0; i < 8; i++) {
    for (newWriteIndex = 0; newWriteIndex < 6; newWriteIndex++) {
      rtb_hipInflateRequest = 7 * i + newWriteIndex;
      backrestMatrix[rtb_hipInflateRequest] = cushionMatrix[6 * i +
        newWriteIndex];
      validMask[rtb_hipInflateRequest] = true;
    }
  }

  validMask[0] = false;
  validMask[49] = false;
  for (newWriteIndex = 0; newWriteIndex < 56; newWriteIndex++) {
    airbag_13Hz_DW.prevBackrest[newWriteIndex] =
      airbag_13Hz_Y.backrestData1[newWriteIndex] -
      airbag_13Hz_DW.prevBackrest[newWriteIndex];
    e[newWriteIndex] = fabsf(airbag_13Hz_DW.prevBackrest[newWriteIndex]);
    b_validMask[newWriteIndex] = true;
  }

  for (i = 0; i < 4; i++) {
    rtb_hipInflateRequest = 7 * f_0[i];
    b_validMask[rtb_hipInflateRequest] = false;
    b_validMask[rtb_hipInflateRequest + 1] = false;
  }

  b_validMask[2] = false;
  b_validMask[51] = false;
  memcpy(&airbag_13Hz_DW.prevCushion[0], &airbag_13Hz_Y.cushionData1[0], 48U *
         sizeof(real32_T));
  memcpy(&airbag_13Hz_DW.prevBackrest[0], &airbag_13Hz_Y.backrestData1[0], 56U *
         sizeof(real32_T));
  if (rtIsInf(airbag_13Hz_DW.frameCount - 1.0)) {
    r = (rtNaN);
  } else {
    r = fmod(airbag_13Hz_DW.frameCount - 1.0, 13.0);
    if (r == 0.0) {
      r = 0.0;
    }
  }

  rtb_hipInflateRequest = 0;
  for (i = 0; i < 56; i++) {
    if (validMask[i]) {
      rtb_hipInflateRequest++;
    }
  }

  newWriteIndex = rtb_hipInflateRequest;
  rtb_hipInflateRequest = 0;
  for (i = 0; i < 56; i++) {
    if (validMask[i]) {
      tmp_data[rtb_hipInflateRequest] = (int8_T)i;
      rtb_hipInflateRequest++;
    }
  }

  for (i = 0; i < newWriteIndex; i++) {
    backrestMatrix_data[i] = backrestMatrix[tmp_data[i]];
  }

  airbag_13Hz_DW.sadHistCushion[(int32_T)(r + 1.0) - 1] = airbag_13Hz_sum
    (backrestMatrix_data, &newWriteIndex) / 46.0F;
  rtb_hipInflateRequest = 0;
  for (i = 0; i < 56; i++) {
    if (b_validMask[i]) {
      rtb_hipInflateRequest++;
    }
  }

  newWriteIndex = rtb_hipInflateRequest;
  rtb_hipInflateRequest = 0;
  for (i = 0; i < 56; i++) {
    if (b_validMask[i]) {
      tmp_data_0[rtb_hipInflateRequest] = (int8_T)i;
      rtb_hipInflateRequest++;
    }
  }

  for (i = 0; i < newWriteIndex; i++) {
    backrestMatrix_data[i] = e[tmp_data_0[i]];
  }

  airbag_13Hz_DW.sadHistBackrest[(int32_T)(r + 1.0) - 1] = airbag_13Hz_sum
    (backrestMatrix_data, &newWriteIndex) / 46.0F;
  airbag_13Hz_DW.sadCount = fmin(airbag_13Hz_DW.sadCount + 1.0, 13.0);
  if (rtIsInf(airbag_13Hz_DW.frameCount)) {
    r = (rtNaN);
  } else {
    r = fmod(airbag_13Hz_DW.frameCount, 13.0);
    if (r == 0.0) {
      r = 0.0;
    }
  }

  isStill = ((r == 0.0) && (airbag_13Hz_DW.sadCount >= 13.0));
  nvmCmd = (int32_T)airbag_13Hz_DW.sadCount;
  i = (int32_T)airbag_13Hz_DW.sadCount;
  if (nvmCmd - 1 >= 0) {
    memcpy(&tmp_data_1[0], &airbag_13Hz_DW.sadHistCushion[0], (uint32_T)nvmCmd *
           sizeof(real32_T));
  }

  airbag_13Hz_Y.sadCushion1 = airbag_13Hz_mean(tmp_data_1, &i);
  i = (int32_T)airbag_13Hz_DW.sadCount;
  if (nvmCmd - 1 >= 0) {
    memcpy(&tmp_data_1[0], &airbag_13Hz_DW.sadHistBackrest[0], (uint32_T)nvmCmd *
           sizeof(real32_T));
  }

  airbag_13Hz_Y.sadBackrest1 = airbag_13Hz_mean(tmp_data_1, &i);
  airbag_13Hz_Y.sadEnergy1 = fmaxf(airbag_13Hz_Y.sadCushion1,
    airbag_13Hz_Y.sadBackrest1);
  airbag_13Hz_Y.sadScore1 = fminf(1.0F, airbag_13Hz_Y.sadEnergy1 /
    normalizeScale);
  if ((airbag_13Hz_DW.pState_i == 0) && (airbag_13Hz_DW.sadCount >= 13.0) &&
      ((!(airbag_13Hz_DW.noiseWarmCount >= 39.0F)) ||
       (!(airbag_13Hz_Y.sadEnergy1 > 6.0F * fmaxf(airbag_13Hz_DW.noiseDev, 0.05F)
          + airbag_13Hz_DW.noiseBaseline)))) {
    if (airbag_13Hz_DW.noiseWarmCount < 39.0F) {
      xtmp = 0.0625F;
      airbag_13Hz_DW.noiseWarmCount++;
    } else {
      xtmp = 0.0039F;
    }

    airbag_13Hz_DW.noiseBaseline += (airbag_13Hz_Y.sadEnergy1 -
      airbag_13Hz_DW.noiseBaseline) * xtmp;
    airbag_13Hz_DW.noiseDev = fmaxf((fabsf(airbag_13Hz_Y.sadEnergy1 -
      airbag_13Hz_DW.noiseBaseline) - airbag_13Hz_DW.noiseDev) * xtmp +
      airbag_13Hz_DW.noiseDev, 0.05F);
  }

  if (rtb_isOccupied) {
    airbag_13Hz_DW.sessionFrames = fminf(airbag_13Hz_DW.sessionFrames + 1.0F,
      1.0E+6F);
  } else {
    airbag_13Hz_DW.sessionFrames = 0.0F;
    airbag_13Hz_DW.sessionLivingLatched = false;
    airbag_13Hz_DW.staticStreak = 0.0F;
    for (i = 0; i < 5; i++) {
      airbag_13Hz_DW.livingQueue[i] = false;
    }

    airbag_13Hz_DW.livingQueueLen = 0.0;
    airbag_13Hz_DW.unlocked = false;
  }

  xtmp = fmaxf(airbag_13Hz_DW.noiseDev, 0.05F);
  if (airbag_13Hz_U.sadThresholdIn1 <= 0.0F) {
    baseInflationSeconds = 0.25F;
  } else {
    baseInflationSeconds = fminf(1.0F, airbag_13Hz_U.sadThresholdIn1);
  }

  normalizeScale = fmaxf(baseInflationSeconds * normalizeScale, 3.0F * xtmp +
    airbag_13Hz_DW.noiseBaseline);

  /* Outport: '<Root>/confidence1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_Y.confidence1 = airbag_13Hz_DW.latestConfidence;

  /* MATLAB Function: '<Root>/活体检测1' */
  if (isStill) {
    if (airbag_13Hz_Y.sadEnergy1 >= normalizeScale) {
      microState = 2;
    } else {
      microState = (int8_T)!(airbag_13Hz_Y.sadEnergy1 <= fminf(1.5F * xtmp +
        airbag_13Hz_DW.noiseBaseline, normalizeScale - 0.05F));
    }

    airbag_13Hz_DW.latestRaw = (microState == 2);

    /* Outport: '<Root>/confidence1' */
    airbag_13Hz_Y.confidence1 = airbag_13Hz_Y.sadScore1;
    airbag_13Hz_DW.latestConfidence = airbag_13Hz_Y.sadScore1;
    if (rtb_isOccupied) {
      if (microState != 1) {
        if (airbag_13Hz_DW.livingQueueLen < 5.0) {
          airbag_13Hz_DW.livingQueueLen++;
        }

        airbag_13Hz_DW.livingQueue[0] = airbag_13Hz_DW.livingQueue[1];
        airbag_13Hz_DW.livingQueue[1] = airbag_13Hz_DW.livingQueue[2];
        airbag_13Hz_DW.livingQueue[2] = airbag_13Hz_DW.livingQueue[3];
        airbag_13Hz_DW.livingQueue[3] = airbag_13Hz_DW.livingQueue[4];
        airbag_13Hz_DW.livingQueue[4] = airbag_13Hz_DW.latestRaw;
      }

      switch (microState) {
       case 0:
        airbag_13Hz_DW.staticStreak++;
        break;

       case 2:
        airbag_13Hz_DW.staticStreak = 0.0F;
        break;
      }
    }
  }

  if (airbag_13Hz_DW.livingQueueLen < 5.0) {
    if ((5.0 - airbag_13Hz_DW.livingQueueLen) + 1.0 > 5.0) {
      rtb_hipInflateRequest = 0;
      nvmCmd = 0;
    } else {
      rtb_hipInflateRequest = (int32_T)((5.0 - airbag_13Hz_DW.livingQueueLen) +
        1.0) - 1;
      nvmCmd = 5;
    }

    queueValues_size[0] = 1;
    nvmCmd -= rtb_hipInflateRequest;
    queueValues_size[1] = nvmCmd;
    for (i = 0; i < nvmCmd; i++) {
      queueValues_data[i] = airbag_13Hz_DW.livingQueue[rtb_hipInflateRequest + i];
    }
  } else {
    queueValues_size[0] = 1;
    queueValues_size[1] = 5;
    for (i = 0; i < 5; i++) {
      queueValues_data[i] = airbag_13Hz_DW.livingQueue[i];
    }
  }

  microState = airbag__updateLivingStatusQueue(queueValues_data,
    queueValues_size, rtb_isOccupied);
  if (microState == 0) {
    microState = 0;
  } else if (airbag_13Hz_DW.sessionLivingLatched) {
    if ((airbag_13Hz_DW.sessionFrames <= 390.0F) && (microState == 2) &&
        (airbag_13Hz_DW.staticStreak >= 3.0F)) {
      airbag_13Hz_DW.sessionLivingLatched = false;
      microState = 2;
      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.livingQueue[i] = false;
      }

      airbag_13Hz_DW.livingQueueLen = 5.0;
    } else {
      microState = 3;
    }
  } else {
    switch (microState) {
     case 3:
      airbag_13Hz_DW.sessionLivingLatched = true;
      microState = 3;
      break;

     case 2:
      microState = 2;
      break;

     default:
      microState = 1;
      break;
    }
  }

  switch (microState) {
   case 3:
    airbag_13Hz_DW.unlocked = true;
    break;

   case 2:
    airbag_13Hz_DW.unlocked = false;
    break;
  }

  /* MATLAB Function: '<Root>/久坐按摩1' incorporates:
   *  Inport: '<Root>/manualMassageOn1'
   *  Inport: '<Root>/sitThresholdmin1'
   */
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

  /* Outport: '<Root>/longSitMinutes1' incorporates:
   *  MATLAB Function: '<Root>/久坐按摩1'
   */
  airbag_13Hz_Y.longSitMinutes1 = 0.0F;

  /* Outport: '<Root>/longSitMassageActive1' incorporates:
   *  MATLAB Function: '<Root>/久坐按摩1'
   */
  airbag_13Hz_Y.longSitMassageActive1 = 0.0F;

  /* Outport: '<Root>/longSitCycleRemain1' incorporates:
   *  MATLAB Function: '<Root>/久坐按摩1'
   */
  airbag_13Hz_Y.longSitCycleRemain1 = 0.0F;

  /* Outport: '<Root>/longSitPrompt1' incorporates:
   *  MATLAB Function: '<Root>/久坐按摩1'
   */
  airbag_13Hz_Y.longSitPrompt1 = 0.0F;

  /* MATLAB Function: '<Root>/久坐按摩1' incorporates:
   *  Inport: '<Root>/longSitMassageStop1'
   *  Inport: '<Root>/resetFlag1'
   *  MATLAB Function: '<Root>/健康干预控制1'
   *  MATLAB Function: '<Root>/健康检测1'
   *  MATLAB Function: '<Root>/入座处理1'
   *  MATLAB Function: '<Root>/活体检测1'
   */
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

  airbag_13Hz_DW.livingLatched = ((rtb_isOccupied && (microState == 3)) ||
    airbag_13Hz_DW.livingLatched);
  newReason = !rtb_isOccupied;
  if (airbag_13Hz_U.resetFlag1 || (airbag_13Hz_DW.pState_i == 3) || newReason) {
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
  } else if ((!airbag_13Hz_DW.livingLatched) && (airbag_13Hz_DW.phase != 1) &&
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
    if ((airbag_13Hz_DW.phase != 1) && (airbag_13Hz_DW.phase != 2)) {
      qY = airbag_13Hz_DW.hipCycleCount + /*MW:OvSatOk*/ 1U;
      if (airbag_13Hz_DW.hipCycleCount + 1U < airbag_13Hz_DW.hipCycleCount) {
        qY = MAX_uint32_T;
      }

      airbag_13Hz_DW.hipCycleCount = qY;
      if ((airbag_13Hz_DW.hipCycleCount >= 3900U) &&
          (!airbag_13Hz_DW.hipInflating)) {
        airbag_13Hz_DW.hipInflating = true;
        airbag_13Hz_DW.hipInflateCount = 0U;
      }

      if (airbag_13Hz_DW.hipInflating) {
        qY = airbag_13Hz_DW.hipInflateCount + /*MW:OvSatOk*/ 1U;
        if (airbag_13Hz_DW.hipInflateCount + 1U < airbag_13Hz_DW.hipInflateCount)
        {
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

    if (manualNow && (!airbag_13Hz_DW.prevManualCmd) && (airbag_13Hz_DW.phase !=
         1) && (airbag_13Hz_DW.phase != 2)) {
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
          /* Outport: '<Root>/longSitPrompt1' */
          airbag_13Hz_Y.longSitPrompt1 = 1.0F;
          if (airbag_13Hz_DW.hipInflating) {
            airbag_13Hz_DW.phase = 2U;
          } else {
            airbag_13Hz_DW.hipInflating = true;
            airbag_13Hz_DW.hipInflateCount = 0U;
            airbag_13Hz_DW.phase = 2U;
          }

          /* Outport: '<Root>/longSitMinutes1' */
          airbag_13Hz_Y.longSitMinutes1 = xtmp;
        } else {
          /* Outport: '<Root>/longSitMinutes1' */
          airbag_13Hz_Y.longSitMinutes1 = (real32_T)airbag_13Hz_DW.sitFrameCount
            * 0.0769230798F / 60.0F;
          qY = sitThresholdFrames -
            /*MW:operator MISRA2012:D4.1 CERT-C:INT30-C 'Justifying MISRA C rule violation'*/
            /*MW:OvSatOk*/ airbag_13Hz_DW.sitFrameCount;
          if (qY > sitThresholdFrames) {
            qY = 0U;
          }

          /* Outport: '<Root>/longSitCycleRemain1' */
          airbag_13Hz_Y.longSitCycleRemain1 = (real32_T)qY;
        }
        break;

       case 2U:
        qY = airbag_13Hz_DW.hipInflateCount + /*MW:OvSatOk*/ 1U;
        if (airbag_13Hz_DW.hipInflateCount + 1U < airbag_13Hz_DW.hipInflateCount)
        {
          qY = MAX_uint32_T;
        }

        airbag_13Hz_DW.hipInflateCount = qY;
        rtb_hipInflateRequest = 1;
        for (i = 0; i < 14; i++) {
          rtb_massageGears[i] = 0;
        }

        /* Outport: '<Root>/longSitMinutes1' */
        airbag_13Hz_Y.longSitMinutes1 = (real32_T)airbag_13Hz_DW.sitFrameCount *
          0.0769230798F / 60.0F;
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

          /* Outport: '<Root>/longSitMassageActive1' */
          airbag_13Hz_Y.longSitMassageActive1 = 1.0F;
        }
        break;

       default:
        rtb_massageEnable = 1;
        for (i = 0; i < 14; i++) {
          rtb_massageGears[i] = 3;
        }

        /* Outport: '<Root>/longSitMassageActive1' */
        airbag_13Hz_Y.longSitMassageActive1 = 1.0F;

        /* Outport: '<Root>/longSitMinutes1' */
        airbag_13Hz_Y.longSitMinutes1 = xtmp;
        if (airbag_13Hz_DW.massageFrameCount < 11700U) {
          airbag_13Hz_DW.massageFrameCount++;
        }

        if (airbag_13Hz_DW.massageFrameCount >= 11700U) {
          rtb_massageEnable = 0;
          for (i = 0; i < 14; i++) {
            rtb_massageGears[i] = 4;
          }

          /* Outport: '<Root>/longSitMassageActive1' */
          airbag_13Hz_Y.longSitMassageActive1 = 0.0F;
          airbag_13Hz_DW.phase = 0U;
          airbag_13Hz_DW.sitFrameCount = 0U;
          airbag_13Hz_DW.massageFrameCount = 0U;
          airbag_13Hz_DW.hipCycleCount = 0U;
          airbag_13Hz_DW.hipInflateCount = 0U;
          airbag_13Hz_DW.hipInflating = false;

          /* Outport: '<Root>/longSitMinutes1' */
          airbag_13Hz_Y.longSitMinutes1 = 0.0F;

          /* Outport: '<Root>/longSitCycleRemain1' */
          airbag_13Hz_Y.longSitCycleRemain1 = (real32_T)sitThresholdFrames;
        }
        break;
      }

      airbag_13Hz_DW.prevOccupied = true;
      airbag_13Hz_DW.prevManualCmd = manualNow;
    }
  }

  /* MATLAB Function: '<Root>/品味系数1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion20'
   *  DataTypeConversion: '<Root>/Data Type Conversion25'
   *  Inport: '<Root>/adoption_frequency1'
   *  Inport: '<Root>/deflation_time1'
   *  Inport: '<Root>/frontCmd1'
   *  Inport: '<Root>/inflation_time2'
   *  MATLAB Function: '<Root>/气囊控制协议1'
   *  MATLAB Function: '<Root>/活体检测1'
   *  SignalConversion generated from: '<S6>/ SFunction '
   *  UnitDelay: '<Root>/Unit Delay2'
   *  UnitDelay: '<Root>/Unit Delay3'
   */
  nvmCmd = 0;
  xtmp = rt_roundf_snf(airbag_13Hz_U.frontCmd1[0]);
  normalizeScale = rt_roundf_snf(airbag_13Hz_U.frontCmd1[1]);
  adjustCmd = airbag_13Hz_directionOf(airbag_13Hz_U.frontCmd1[2]);
  baseInflationSeconds = airbag_13Hz_U.inflation_time2;
  if (rtIsInfF(airbag_13Hz_U.inflation_time2) || rtIsNaNF
      (airbag_13Hz_U.inflation_time2)) {
    baseInflationSeconds = 2.0F;
  } else if (airbag_13Hz_U.inflation_time2 < 0.0F) {
    baseInflationSeconds = 2.0F;
  }

  deflationSeconds = airbag_13Hz_U.deflation_time1;
  if (rtIsInfF(airbag_13Hz_U.deflation_time1) || rtIsNaNF
      (airbag_13Hz_U.deflation_time1)) {
    deflationSeconds = 2.0F;
  } else if (airbag_13Hz_U.deflation_time1 < 0.0F) {
    deflationSeconds = 2.0F;
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
  living = ((real32_T)airbag_13Hz_DW.unlocked > 0.5F);
  if (!manualNow) {
    airbag_13Hz_DW.pSeatHandled = 0.0F;
    airbag_13Hz_DW.pReplayIndex = 0;
    airbag_13Hz_DW.pPending[0] = 0.0F;
    airbag_13Hz_DW.pPending[1] = 0.0F;
    airbag_13Hz_DW.pPending[2] = 0.0F;
    for (i = 0; i < 5; i++) {
      airbag_13Hz_DW.pRequest[i] = 0.0F;
      airbag_13Hz_DW.pEditTimes[i] = airbag_13Hz_DW.pSavedTimes[i];
    }

    airbag_13Hz_DW.pBaseElapsed = 0.0F;
    airbag_13Hz_DW.pBaseReady = 0.0F;
    airbag_13Hz_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_DW.pGapCycles = 0;
    airbag_13Hz_DW.pEntryDeflate = 0.0F;
    if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
      airbag_13Hz_DW.pState = 3.0F;
    } else {
      airbag_13Hz_DW.pState = (real32_T)(airbag_13Hz_DW.pValid > 0.5F);
    }
  }

  tmp_1 = ((rtb_reasonCode == 1) || (rtb_reasonCode == 2) || (rtb_reasonCode ==
            7) || (rtb_reasonCode == 8));
  if ((manualNow && (airbag_13Hz_DW.pPrevOccupied <= 0.5F)) || ((rtb_reasonCode
        != airbag_13Hz_DW.pPrevReasonCode_j) && tmp_1)) {
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

  living = (manualNow && living && (airbag_13Hz_DW.pBaseReady > 0.5F) &&
            (!(rtb_massageEnable > 0.5F)));
  if ((airbag_13Hz_DW.UnitDelay2_DSTATE[0] > 0.5F) &&
      (airbag_13Hz_DW.pPrevNvmValid <= 0.5F)) {
    for (newWriteIndex = 0; newWriteIndex < 5; newWriteIndex++) {
      baseInflationSeconds = airbag_13Hz_DW.UnitDelay2_DSTATE[newWriteIndex + 1];
      if (rtIsInfF(baseInflationSeconds) || rtIsNaNF(baseInflationSeconds)) {
        baseInflationSeconds = 0.0F;
        airbag_13Hz_DW.pSavedTimes[newWriteIndex] = 0.0F;
      } else {
        d = d_1[newWriteIndex];
        baseInflationSeconds = fmaxf(-(real32_T)d, fminf(d, baseInflationSeconds));
        airbag_13Hz_DW.pSavedTimes[newWriteIndex] = baseInflationSeconds;
      }

      airbag_13Hz_DW.pEditTimes[newWriteIndex] = baseInflationSeconds;
    }

    gapActive = airbag_13Hz_allFinitePositive(&airbag_13Hz_DW.UnitDelay2_DSTATE
      [6]);
    for (i = 0; i < 8; i++) {
      if (gapActive) {
        airbag_13Hz_DW.pThresholds[i] = airbag_13Hz_DW.UnitDelay2_DSTATE[i + 6];
      } else {
        airbag_13Hz_DW.pThresholds[i] = e_1[i];
      }
    }

    airbag_13Hz_DW.pAdaptiveOff = (real32_T)(airbag_13Hz_DW.UnitDelay2_DSTATE[14]
      > 0.5F);
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
        airbag_13Hz_DW.pEditTimes[i] = airbag_13Hz_DW.pSavedTimes[i];
      }

      airbag_13Hz_DW.pReplayIndex = 1;
    } else if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
      airbag_13Hz_DW.pState = 3.0F;
    }
  }

  if ((xtmp != 0.0F) && (xtmp != airbag_13Hz_DW.pPrevFrontCmd[0])) {
    if (xtmp == 1.0F) {
      airbag_13Hz_DW.pState = 1.0F;
      airbag_13Hz_DW.pPending[1] = 0.0F;
      airbag_13Hz_DW.pEntryDeflate = 1.0F;
      airbag_13Hz_DW.pReplayIndex = 0;
      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.pEditTimes[i] = 0.0F;
      }

      if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
        airbag_13Hz_DW.pAdaptiveOff = 0.0F;
        nvmCmd = 3;
      }
    } else if (xtmp == 2.0F) {
      if (airbag_13Hz_DW.pState == 1.0F) {
        airbag_13Hz_DW.pPending[0] = 1.0F;
      }
    } else if (xtmp == 3.0F) {
      airbag_13Hz_DW.pPending[1] = 1.0F;
      airbag_13Hz_DW.pEntryDeflate = 0.0F;
      if (airbag_13Hz_DW.pAdaptiveOff > 0.5F) {
        airbag_13Hz_DW.pAdaptiveOff = 0.0F;
        nvmCmd = 3;
      }
    } else if (xtmp == 4.0F) {
      airbag_13Hz_DW.pState = 0.0F;
      airbag_13Hz_DW.pValid = 0.0F;
      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.pSavedTimes[i] = 0.0F;
        airbag_13Hz_DW.pEditTimes[i] = 0.0F;
      }

      for (i = 0; i < 8; i++) {
        airbag_13Hz_DW.pThresholds[i] = e_1[i];
      }

      airbag_13Hz_DW.pReplayIndex = 0;
      airbag_13Hz_DW.pSeatHandled = 1.0F;
      airbag_13Hz_DW.pPending[0] = 0.0F;
      airbag_13Hz_DW.pPending[1] = 0.0F;
      airbag_13Hz_DW.pPending[2] = 1.0F;
      airbag_13Hz_DW.pAdaptiveOff = 0.0F;
      airbag_13Hz_DW.pEntryDeflate = 0.0F;
      nvmCmd = 2;
    } else if (xtmp == 5.0F) {
      airbag_13Hz_DW.pState = 3.0F;
      airbag_13Hz_DW.pPending[1] = 0.0F;
      airbag_13Hz_DW.pEntryDeflate = 0.0F;
      if (airbag_13Hz_DW.pAdaptiveOff <= 0.5F) {
        airbag_13Hz_DW.pAdaptiveOff = 1.0F;
        nvmCmd = 3;
      }
    }
  }

  gapActive = (airbag_13Hz_DW.pGapCycles > 0);
  if (gapActive && (airbag_13Hz_DW.pGapCycles >= -2147483647)) {
    airbag_13Hz_DW.pGapCycles--;
  }

  b_requestIdle_tmp = !gapActive;
  requestIdle = ((airbag_13Hz_DW.pRequest[0] <= 0.5F) && b_requestIdle_tmp);
  if ((airbag_13Hz_DW.pPending[2] > 0.5F) && (requestIdle && living)) {
    airbag_13Hz_DW.pRequest[0] = 1.0F;
    airbag_13Hz_DW.pRequest[1] = 0.0F;
    airbag_13Hz_DW.pRequest[2] = -1.0F;
    airbag_13Hz_DW.pRequest[3] = deflationSeconds;
    airbag_13Hz_DW.pRequest[4] = 3.0F;
    airbag_13Hz_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_DW.pPending[2] = 0.0F;
    requestIdle = false;
  }

  if ((airbag_13Hz_DW.pEntryDeflate > 0.5F) && requestIdle && living &&
      (airbag_13Hz_DW.pPending[2] <= 0.5F)) {
    for (i = 0; i < 5; i++) {
      airbag_13Hz_DW.pRequest[i] = g[i];
    }

    airbag_13Hz_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_DW.pEntryDeflate = 0.0F;
    requestIdle = false;
  }

  if ((adjustCmd != 0.0F) && ((adjustCmd != airbag_13Hz_DW.pPrevFrontCmd[2]) ||
       (normalizeScale != airbag_13Hz_DW.pPrevFrontCmd[1])) && requestIdle &&
      (airbag_13Hz_DW.pReplayIndex == 0) && (airbag_13Hz_DW.pState == 1.0F) &&
      living && (airbag_13Hz_DW.pEntryDeflate <= 0.5F)) {
    tmp_0[0] = (airbag_13Hz_DW.pPending[0] > 0.5F);
    tmp_0[1] = (airbag_13Hz_DW.pPending[1] > 0.5F);
    tmp_0[2] = (airbag_13Hz_DW.pPending[2] > 0.5F);
    if (!airbag_13Hz_any(tmp_0)) {
      if (normalizeScale < 2.14748365E+9F) {
        if (normalizeScale >= -2.14748365E+9F) {
          i = (int32_T)normalizeScale;
        } else {
          i = MIN_int32_T;
        }
      } else {
        i = MAX_int32_T;
      }

      if ((i >= 1) && (i <= 5)) {
        baseInflationSeconds = airbag_13Hz_DW.pEditTimes[i - 1];
        deflationSeconds = h[i - 1];
        adoptionFrequency = deflationSeconds * adjustCmd + baseInflationSeconds;
        if (rtIsInfF(adoptionFrequency) || rtIsNaNF(adoptionFrequency)) {
          adoptionFrequency = 0.0F;
        } else {
          rtb_backrest_cop_y = d_1[i - 1];
          adoptionFrequency = fmaxf(-rtb_backrest_cop_y, fminf
            (rtb_backrest_cop_y, adoptionFrequency));
        }

        if (baseInflationSeconds != adoptionFrequency) {
          airbag_13Hz_DW.pEditTimes[i - 1] = adoptionFrequency;
          airbag_13Hz_DW.pRequest[0] = 1.0F;
          airbag_13Hz_DW.pRequest[1] = (real32_T)i;
          airbag_13Hz_DW.pRequest[2] = adjustCmd;
          airbag_13Hz_DW.pRequest[3] = deflationSeconds;
          airbag_13Hz_DW.pRequest[4] = 1.0F;
          airbag_13Hz_DW.pRequestElapsed = 0.0F;
          requestIdle = false;
        }
      }
    }
  }

  if ((airbag_13Hz_DW.pReplayIndex > 0) && living && requestIdle &&
      (airbag_13Hz_DW.pPending[2] <= 0.5F) && (airbag_13Hz_DW.pEntryDeflate <=
       0.5F)) {
    newWriteIndex = 0;
    exitg1 = false;
    while ((!exitg1) && (newWriteIndex < 5)) {
      if (airbag_13Hz_DW.pReplayIndex <= 5) {
        idx = airbag_13Hz_DW.pReplayIndex;
        deflationSeconds =
          airbag_13Hz_DW.pSavedTimes[airbag_13Hz_DW.pReplayIndex - 1];
        airbag_13Hz_DW.pReplayIndex++;
        baseInflationSeconds = fabsf(deflationSeconds);
        if (baseInflationSeconds > 0.01F) {
          airbag_13Hz_DW.pRequest[0] = 1.0F;
          airbag_13Hz_DW.pRequest[1] = (real32_T)idx;
          airbag_13Hz_DW.pRequest[2] = airbag_13Hz_directionOf(deflationSeconds);
          airbag_13Hz_DW.pRequest[3] = baseInflationSeconds;
          airbag_13Hz_DW.pRequest[4] = 2.0F;
          airbag_13Hz_DW.pRequestElapsed = 0.0F;
          exitg1 = true;
        } else {
          newWriteIndex++;
        }
      } else {
        newWriteIndex++;
      }
    }
  }

  if ((airbag_13Hz_DW.pReplayIndex > 5) && (airbag_13Hz_DW.pRequest[0] <= 0.5F) &&
      b_requestIdle_tmp) {
    airbag_13Hz_DW.pReplayIndex = 0;
  }

  if ((airbag_13Hz_DW.pRequest[0] <= 0.5F) && ((airbag_13Hz_DW.pReplayIndex == 0)
       && ((airbag_13Hz_DW.pPending[2] <= 0.5F) &&
           ((airbag_13Hz_DW.pEntryDeflate <= 0.5F) && b_requestIdle_tmp)))) {
    if ((airbag_13Hz_DW.pPending[0] > 0.5F) && living) {
      for (i = 0; i < 5; i++) {
        airbag_13Hz_DW.pSavedTimes[i] = airbag_13Hz_DW.pEditTimes[i];
      }

      airbag_13Hz_makeThresholds(airbag_13Hz_DW.UnitDelay3_DSTATE[0],
        airbag_13Hz_DW.UnitDelay3_DSTATE[1], airbag_13Hz_DW.UnitDelay3_DSTATE[2],
        airbag_13Hz_DW.UnitDelay3_DSTATE[3], airbag_13Hz_DW.pThresholds);
      airbag_13Hz_DW.pValid = 1.0F;
      airbag_13Hz_DW.pState = 1.0F;
      airbag_13Hz_DW.pPending[0] = 0.0F;
      nvmCmd = 1;
    }

    if ((airbag_13Hz_DW.pPending[1] > 0.5F) && (airbag_13Hz_DW.pPending[0] <=
         0.5F)) {
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
    gapActive = (airbag_13Hz_any(tmp_0) || ((airbag_13Hz_DW.pEntryDeflate > 0.5F)
      || gapActive));
  }

  b_requestIdle_tmp = (((airbag_13Hz_DW.pState == 0.0F) ||
                        (airbag_13Hz_DW.pState == 2.0F)) && living && ((real32_T)
    gapActive <= 0.5F));
  deflationSeconds = airbag_13Hz_DW.pRequest[1];
  rtb_status[1] = airbag_13Hz_DW.pValid;
  rtb_status[2] = b_requestIdle_tmp;
  rtb_status[3] = gapActive;
  rtb_nvmWrite[0] = (real32_T)nvmCmd;
  for (i = 0; i < 5; i++) {
    rtb_status[i + 4] = airbag_13Hz_DW.pEditTimes[i];
    rtb_nvmWrite[i + 1] = airbag_13Hz_DW.pSavedTimes[i];
  }

  for (i = 0; i < 8; i++) {
    rtb_nvmWrite[i + 6] = airbag_13Hz_DW.pThresholds[i];
  }

  rtb_nvmWrite[14] = airbag_13Hz_DW.pAdaptiveOff;
  airbag_13Hz_DW.pPrevFrontCmd[0] = xtmp;
  airbag_13Hz_DW.pPrevFrontCmd[1] = normalizeScale;
  airbag_13Hz_DW.pPrevFrontCmd[2] = adjustCmd;
  airbag_13Hz_DW.pPrevNvmValid = airbag_13Hz_DW.UnitDelay2_DSTATE[0];
  airbag_13Hz_DW.pPrevReasonCode_j = rtb_reasonCode;
  airbag_13Hz_DW.pPrevOccupied = manualNow;

  /* Switch: '<Root>/Switch1' incorporates:
   *  Inport: '<Root>/leftDeflateThreshold1'
   *  Inport: '<Root>/leftInflateThreshold1'
   *  Inport: '<Root>/ratioDeflate1'
   *  Inport: '<Root>/ratioDeflateLeft1'
   *  Inport: '<Root>/ratioInflate1'
   *  Inport: '<Root>/ratioInflateLeft1'
   *  Inport: '<Root>/rightDeflateThreshold1'
   *  Inport: '<Root>/rightInflateThreshold1'
   *  MATLAB Function: '<Root>/品味系数1'
   */
  if (rtb_status[1] > 0.5F) {
    airbag_13Hz_Y.ratioInflate_out1 = airbag_13Hz_DW.pThresholds[0];
    airbag_13Hz_Y.ratioDeflate_out1 = airbag_13Hz_DW.pThresholds[1];
    airbag_13Hz_Y.ratioInflateLeft_out1 = airbag_13Hz_DW.pThresholds[2];
    airbag_13Hz_Y.ratioDeflateLeft_out1 = airbag_13Hz_DW.pThresholds[3];
    airbag_13Hz_Y.leftInflateThreshold_out1 = airbag_13Hz_DW.pThresholds[4];
    airbag_13Hz_Y.leftDeflateThreshold_out1 = airbag_13Hz_DW.pThresholds[5];
    airbag_13Hz_Y.rightInflateThreshold_out1 = airbag_13Hz_DW.pThresholds[6];
    airbag_13Hz_Y.rightDeflateThreshold_out1 = airbag_13Hz_DW.pThresholds[7];
  } else {
    airbag_13Hz_Y.ratioInflate_out1 = airbag_13Hz_U.ratioInflate1;
    airbag_13Hz_Y.ratioDeflate_out1 = airbag_13Hz_U.ratioDeflate1;
    airbag_13Hz_Y.ratioInflateLeft_out1 = airbag_13Hz_U.ratioInflateLeft1;
    airbag_13Hz_Y.ratioDeflateLeft_out1 = airbag_13Hz_U.ratioDeflateLeft1;
    airbag_13Hz_Y.leftInflateThreshold_out1 =
      airbag_13Hz_U.leftInflateThreshold1;
    airbag_13Hz_Y.leftDeflateThreshold_out1 =
      airbag_13Hz_U.leftDeflateThreshold1;
    airbag_13Hz_Y.rightInflateThreshold_out1 =
      airbag_13Hz_U.rightInflateThreshold1;
    airbag_13Hz_Y.rightDeflateThreshold_out1 =
      airbag_13Hz_U.rightDeflateThreshold1;
  }

  /* End of Switch: '<Root>/Switch1' */

  /* MATLAB Function: '<Root>/侧翼状态判定1' incorporates:
   *  Inport: '<Root>/backTotalThreshold1'
   */
  normalizeScale = airbag_13Hz_Y.backrestData1[7];
  xtmp = airbag_13Hz_Y.backrestData1[28];
  for (newWriteIndex = 0; newWriteIndex < 20; newWriteIndex++) {
    nvmCmd = (int32_T)((uint32_T)(newWriteIndex + 1) / 7U);
    idx = (newWriteIndex + 1) % 7;
    normalizeScale += airbag_13Hz_Y.backrestData1[(nvmCmd + 1) * 7 + idx];
    xtmp += airbag_13Hz_Y.backrestData1[(nvmCmd + 4) * 7 + idx];
  }

  airbag_13Hz_Y.leftPressure1 = normalizeScale * 1.57894742F;
  airbag_13Hz_Y.rightPressure1 = xtmp * 1.57894742F;
  for (idx = 0; idx < 6; idx++) {
    xpageoffset = idx * 7;
    xtmp = airbag_13Hz_Y.backrestData1[((int32_T)((uint32_T)xpageoffset / 7U) +
      1) * 7 + xpageoffset % 7];
    for (newWriteIndex = 0; newWriteIndex < 6; newWriteIndex++) {
      nvmCmd = (xpageoffset + newWriteIndex) + 1;
      xtmp += airbag_13Hz_Y.backrestData1[((int32_T)((uint32_T)nvmCmd / 7U) + 1)
        * 7 + nvmCmd % 7];
    }

    c_y[idx] = xtmp;
  }

  normalizeScale = c_y[0];
  for (newWriteIndex = 0; newWriteIndex < 5; newWriteIndex++) {
    normalizeScale += c_y[newWriteIndex + 1];
  }

  airbag_13Hz_Y.backMeanTotal_wing1 = normalizeScale / 38.0F;
  if ((airbag_13Hz_Y.rightPressure1 > 0.0F) &&
      (airbag_13Hz_Y.backMeanTotal_wing1 > airbag_13Hz_U.backTotalThreshold1)) {
    xtmp = airbag_13Hz_Y.leftPressure1 / airbag_13Hz_Y.rightPressure1;
  } else {
    xtmp = (real32_T)!(airbag_13Hz_Y.backMeanTotal_wing1 >
                       airbag_13Hz_U.backTotalThreshold1);
  }

  if (xtmp > airbag_13Hz_Y.ratioDeflateLeft_out1) {
    rtb_leftAction_h = 1;
    xpageoffset = 2;
  } else if (xtmp < airbag_13Hz_Y.ratioInflateLeft_out1) {
    rtb_leftAction_h = 2;
    xpageoffset = 1;
  } else {
    rtb_leftAction_h = 0;
    xpageoffset = 0;
  }

  /* MATLAB Function: '<Root>/腰托气囊控制逻辑1' incorporates:
   *  Inport: '<Root>/backTotalThreshold1'
   */
  normalizeScale = airbag_13Hz_Y.backrestData1[0];
  for (newWriteIndex = 0; newWriteIndex < 31; newWriteIndex++) {
    normalizeScale += airbag_13Hz_Y.backrestData1[((newWriteIndex + 1) >> 2) * 7
      + (newWriteIndex + 1) % 4];
  }

  airbag_13Hz_Y.upperMean1 = normalizeScale / 22.0F;
  normalizeScale = airbag_13Hz_Y.backrestData1[4];
  for (newWriteIndex = 0; newWriteIndex < 23; newWriteIndex++) {
    normalizeScale += airbag_13Hz_Y.backrestData1[((int32_T)((uint32_T)
      (newWriteIndex + 1) / 3U) * 7 + (newWriteIndex + 1) % 3) + 4];
  }

  airbag_13Hz_Y.lowerMean1 = normalizeScale / 24.0F;
  airbag_13Hz_Y.backMeanTotal_lumbar1 = airbag_13Hz_Y.upperMean1 +
    airbag_13Hz_Y.lowerMean1;
  if (airbag_13Hz_Y.lowerMean1 > 0.0F) {
    normalizeScale = airbag_13Hz_Y.upperMean1 / airbag_13Hz_Y.lowerMean1;
  } else {
    normalizeScale = 0.0F;
  }

  nvmCmd = (airbag_13Hz_Y.backMeanTotal_lumbar1 >=
            airbag_13Hz_U.backTotalThreshold1);
  if (nvmCmd == 0) {
    idx = 0;
  } else if (normalizeScale > airbag_13Hz_Y.ratioInflate_out1) {
    idx = 1;
  } else if (normalizeScale < airbag_13Hz_Y.ratioDeflate_out1) {
    idx = 2;
  } else {
    idx = 0;
  }

  /* MATLAB Function: '<Root>/腿托气囊控制逻辑1' */
  adjustCmd = airbag_13Hz_Y.cushionData1[3];
  for (newWriteIndex = 0; newWriteIndex < 11; newWriteIndex++) {
    adjustCmd += airbag_13Hz_Y.cushionData1[((int32_T)((uint32_T)(newWriteIndex
      + 1) / 3U) * 6 + (newWriteIndex + 1) % 3) + 3];
  }

  airbag_13Hz_Y.leftButtMean1 = adjustCmd / 12.0F;
  adjustCmd = airbag_13Hz_Y.cushionData1[1];
  for (newWriteIndex = 0; newWriteIndex < 7; newWriteIndex++) {
    adjustCmd += airbag_13Hz_Y.cushionData1[(((newWriteIndex + 1) >> 1) * 6 +
      (newWriteIndex + 1) % 2) + 1];
  }

  airbag_13Hz_Y.leftLegMean1 = adjustCmd / 8.0F;
  adjustCmd = airbag_13Hz_Y.cushionData1[27];
  for (newWriteIndex = 0; newWriteIndex < 11; newWriteIndex++) {
    adjustCmd += airbag_13Hz_Y.cushionData1[(((int32_T)((uint32_T)(newWriteIndex
      + 1) / 3U) + 4) * 6 + (newWriteIndex + 1) % 3) + 3];
  }

  airbag_13Hz_Y.rightButtMean1 = adjustCmd / 12.0F;
  adjustCmd = airbag_13Hz_Y.cushionData1[25];
  for (newWriteIndex = 0; newWriteIndex < 7; newWriteIndex++) {
    adjustCmd += airbag_13Hz_Y.cushionData1[((((newWriteIndex + 1) >> 1) + 4) *
      6 + (newWriteIndex + 1) % 2) + 1];
  }

  airbag_13Hz_Y.rightLegMean1 = adjustCmd / 8.0F;
  if (airbag_13Hz_Y.leftButtMean1 > 0.0F) {
    adjustCmd = airbag_13Hz_Y.leftLegMean1 / airbag_13Hz_Y.leftButtMean1;
  } else {
    adjustCmd = 0.0F;
  }

  if (airbag_13Hz_Y.rightButtMean1 > 0.0F) {
    baseInflationSeconds = airbag_13Hz_Y.rightLegMean1 /
      airbag_13Hz_Y.rightButtMean1;
  } else {
    baseInflationSeconds = 0.0F;
  }

  if (adjustCmd < airbag_13Hz_Y.leftInflateThreshold_out1) {
    rtb_leftAction = 1;
  } else if (adjustCmd > airbag_13Hz_Y.leftDeflateThreshold_out1) {
    rtb_leftAction = 2;
  } else {
    rtb_leftAction = 0;
  }

  if (baseInflationSeconds < airbag_13Hz_Y.rightInflateThreshold_out1) {
    rtb_rightAction = 1;
  } else if (baseInflationSeconds > airbag_13Hz_Y.rightDeflateThreshold_out1) {
    rtb_rightAction = 2;
  } else {
    rtb_rightAction = 0;
  }

  /* MATLAB Function: '<Root>/健康检测1' incorporates:
   *  Inport: '<Root>/resetFlag1'
   */
  rtb_cop_x = 0.0F;
  rtb_delta_x = 0.0F;
  rtb_delta_y = 0.0F;
  rtb_rms_displacement = 0.0F;
  rtb_avg_velocity = 0.0F;
  rtb_isStable = 0;
  rtb_backrest_cop_y = 0.0F;
  rtb_cushionSum_a = 0.0F;
  adoptionFrequency = 0.0F;
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
    rtb_cushionSum_a = 0.0F;
    for (newWriteIndex = 0; newWriteIndex < 8; newWriteIndex++) {
      for (i = 0; i < 7; i++) {
        rtb_cop_x = airbag_13Hz_Y.backrestData1[newWriteIndex * 7 + i];
        if (rtIsInfF(rtb_cop_x)) {
          rtb_cop_x = 0.0F;
        } else if (rtb_cop_x <= 4.0F) {
          rtb_cop_x = 0.0F;
        }

        adoptionFrequency += rtb_cop_x;
        rtb_cushionSum_a += (((real32_T)newWriteIndex + 1.0F) - 1.0F) *
          rtb_cop_x;
      }
    }

    if (adoptionFrequency > 0.0F) {
      rtb_backrest_cop_y = rtb_cushionSum_a / adoptionFrequency;
    }

    rtb_cushionSum_a = 0.0F;
    rtb_cop_x = 0.0F;
    b_weightedY = 0.0F;
    for (newWriteIndex = 0; newWriteIndex < 8; newWriteIndex++) {
      for (i = 0; i < 6; i++) {
        b_pressure = airbag_13Hz_Y.cushionData1[newWriteIndex * 6 + i];
        if (rtIsInfF(b_pressure)) {
          b_pressure = 0.0F;
        } else if (b_pressure <= 4.0F) {
          b_pressure = 0.0F;
        }

        rtb_cushionSum_a += b_pressure;
        rtb_cop_x += (((real32_T)i + 1.0F) - 1.0F) * b_pressure;
        b_weightedY += (((real32_T)newWriteIndex + 1.0F) - 1.0F) * b_pressure;
      }
    }

    if (rtb_cushionSum_a > 0.0F) {
      rtb_cop_x /= rtb_cushionSum_a;
      b_weightedY /= rtb_cushionSum_a;
    } else {
      rtb_cop_x = 0.0F;
      b_weightedY = 0.0F;
    }

    if (!(rtb_cushionSum_a <= 0.0F)) {
      if (airbag_13Hz_DW.pFrameCount <= 2147483646) {
        airbag_13Hz_DW.pFrameCount++;
      }

      if (rtb_cushionSum_a > airbag_13Hz_DW.pPeakPressure) {
        airbag_13Hz_DW.pPeakPressure = rtb_cushionSum_a;
      }

      if ((airbag_13Hz_DW.pFrameCount > 10) && (!(rtb_cushionSum_a <
            airbag_13Hz_DW.pPeakPressure * 0.8F)) && (!(rtb_cushionSum_a <
            200.0F))) {
        rtb_isStable = 1;
        if (airbag_13Hz_DW.pWriteIndex > 2147483646) {
          i = MAX_int32_T;
        } else {
          i = airbag_13Hz_DW.pWriteIndex + 1;
        }

        newWriteIndex = i - 1;
        if (airbag_13Hz_DW.pWriteIndex > 2147483646) {
          i = MAX_int32_T;
        } else {
          i = airbag_13Hz_DW.pWriteIndex + 1;
        }

        if (i > 125) {
          newWriteIndex = 0;
        }

        addedEdgeLength = 0.0F;
        if (airbag_13Hz_DW.pBufLen > 0) {
          i = newWriteIndex - 1;
          if (newWriteIndex < 1) {
            i = 124;
          }

          b_pressure = rtb_cop_x - airbag_13Hz_DW.pCopBufX[i];
          dyNew = b_weightedY - airbag_13Hz_DW.pCopBufY[i];
          addedEdgeLength = (real32_T)sqrt(b_pressure * b_pressure + dyNew *
            dyNew);
        }

        if (airbag_13Hz_DW.pBufLen < 125) {
          airbag_13Hz_DW.pBufLen++;
          airbag_13Hz_DW.pSumX += rtb_cop_x;
          airbag_13Hz_DW.pSumY += b_weightedY;
          airbag_13Hz_DW.pSumX2 += rtb_cop_x * rtb_cop_x;
          airbag_13Hz_DW.pSumY2 += b_weightedY * b_weightedY;
          pathIncrement = addedEdgeLength - airbag_13Hz_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_DW.pPathLength + pathIncrement;
          airbag_13Hz_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_DW.pPathLength) - pathIncrement;
          airbag_13Hz_DW.pPathLength = addedEdgeLength;
        } else {
          i = newWriteIndex + 1;
          if (newWriteIndex + 2 > 125) {
            i = 0;
          }

          b_pressure = airbag_13Hz_DW.pCopBufX[i] -
            airbag_13Hz_DW.pCopBufX[newWriteIndex];
          dyNew = airbag_13Hz_DW.pCopBufY[i] -
            airbag_13Hz_DW.pCopBufY[newWriteIndex];
          airbag_13Hz_DW.pSumX = (airbag_13Hz_DW.pSumX + rtb_cop_x) -
            airbag_13Hz_DW.pCopBufX[newWriteIndex];
          airbag_13Hz_DW.pSumY = (airbag_13Hz_DW.pSumY + b_weightedY) -
            airbag_13Hz_DW.pCopBufY[newWriteIndex];
          airbag_13Hz_DW.pSumX2 = (rtb_cop_x * rtb_cop_x + airbag_13Hz_DW.pSumX2)
            - airbag_13Hz_DW.pCopBufX[newWriteIndex] *
            airbag_13Hz_DW.pCopBufX[newWriteIndex];
          airbag_13Hz_DW.pSumY2 = (b_weightedY * b_weightedY +
            airbag_13Hz_DW.pSumY2) - airbag_13Hz_DW.pCopBufY[newWriteIndex] *
            airbag_13Hz_DW.pCopBufY[newWriteIndex];
          pathIncrement = addedEdgeLength - airbag_13Hz_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_DW.pPathLength + pathIncrement;
          airbag_13Hz_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_DW.pPathLength) - pathIncrement;
          airbag_13Hz_DW.pPathLength = addedEdgeLength;
          pathIncrement = -(real32_T)sqrt(b_pressure * b_pressure + dyNew *
            dyNew) - airbag_13Hz_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_DW.pPathLength + pathIncrement;
          airbag_13Hz_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_DW.pPathLength) - pathIncrement;
          airbag_13Hz_DW.pPathLength = addedEdgeLength;
          if (airbag_13Hz_DW.pPathLength < 0.0F) {
            airbag_13Hz_DW.pPathLength = 0.0F;
            airbag_13Hz_DW.pPathCompensation = 0.0F;
          }
        }

        airbag_13Hz_DW.pCopBufX[newWriteIndex] = rtb_cop_x;
        airbag_13Hz_DW.pCopBufY[newWriteIndex] = b_weightedY;
        airbag_13Hz_DW.pWriteIndex = newWriteIndex + 1;
        if (airbag_13Hz_DW.pBufLen >= 2) {
          rtb_delta_x = airbag_13Hz_DW.pCopBufX[0];
          rtb_avg_velocity = airbag_13Hz_DW.pCopBufX[0];
          rtb_delta_y = airbag_13Hz_DW.pCopBufY[0];
          rtb_rms_displacement = airbag_13Hz_DW.pCopBufY[0];
          for (newWriteIndex = 2; newWriteIndex <= airbag_13Hz_DW.pBufLen;
               newWriteIndex++) {
            b_weightedY = airbag_13Hz_DW.pCopBufX[newWriteIndex - 1];
            if (b_weightedY < rtb_delta_x) {
              rtb_delta_x = b_weightedY;
            } else if (b_weightedY > rtb_avg_velocity) {
              rtb_avg_velocity = b_weightedY;
            }

            b_weightedY = airbag_13Hz_DW.pCopBufY[newWriteIndex - 1];
            if (b_weightedY < rtb_delta_y) {
              rtb_delta_y = b_weightedY;
            } else if (b_weightedY > rtb_rms_displacement) {
              rtb_rms_displacement = b_weightedY;
            }
          }

          rtb_delta_x = (rtb_avg_velocity - rtb_delta_x) * 7.0F;
          rtb_delta_y = (rtb_rms_displacement - rtb_delta_y) * 7.0F;
          rtb_rms_displacement = (airbag_13Hz_DW.pSumX2 + airbag_13Hz_DW.pSumY2)
            - (airbag_13Hz_DW.pSumX * airbag_13Hz_DW.pSumX +
               airbag_13Hz_DW.pSumY * airbag_13Hz_DW.pSumY) / (real32_T)
            airbag_13Hz_DW.pBufLen;
          if (rtb_rms_displacement < 0.0F) {
            rtb_rms_displacement = 0.0F;
          }

          rtb_rms_displacement = (real32_T)sqrt(rtb_rms_displacement / (real32_T)
            airbag_13Hz_DW.pBufLen) * 0.7F;
          rtb_avg_velocity = airbag_13Hz_DW.pPathLength / 0.0769230798F * 7.0F /
            (real32_T)airbag_13Hz_DW.pBufLen;
        }
      }
    }
  }

  /* Outport: '<Root>/spineProtectActive1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_Y.spineProtectActive1 = 0.0F;

  /* Outport: '<Root>/spineProtectSide1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_Y.spineProtectSide1 = 0.0F;

  /* Outport: '<Root>/bumpReliefActive1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_Y.bumpReliefActive1 = 0.0F;

  /* Outport: '<Root>/motionSicknessActive1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_Y.motionSicknessActive1 = 0.0F;

  /* MATLAB Function: '<Root>/健康干预控制1' */
  rtb_healthSideWingLeftAction = 0;
  rtb_healthSideWingRightAction = 0;
  newWriteIndex = 0;

  /* Outport: '<Root>/spineBiasSeconds1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_Y.spineBiasSeconds1 = 0.0F;

  /* Outport: '<Root>/bumpDetectSeconds1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_Y.bumpDetectSeconds1 = 0.0F;

  /* MATLAB Function: '<Root>/健康干预控制1' */
  airbag_13Hz_Y.cushionForwardMoveMm1 = 0.0F;
  airbag_13Hz_Y.backrestDropRatio1 = 1.0F;

  /* Outport: '<Root>/sickEventCount1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_Y.sickEventCount1 = 0.0F;

  /* MATLAB Function: '<Root>/健康干预控制1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion15'
   *  Inport: '<Root>/ bumpMaxRangeMm1'
   *  Inport: '<Root>/ bumpMaxRms1'
   *  Inport: '<Root>/ bumpMinVelocity1'
   *  Inport: '<Root>/ bumpTimeThresholdSec1'
   *  Inport: '<Root>/ cushionForwardSign1'
   *  Inport: '<Root>/ sickBackDropRatio1'
   *  Inport: '<Root>/ sickForwardMinMm1'
   *  Inport: '<Root>/ sickPairWindowSec1'
   *  Inport: '<Root>/ spineBiasDeadband1'
   *  Inport: '<Root>/ spineTimeThresholdSec1'
   *  Inport: '<Root>/resetFlag1'
   *  Logic: '<Root>/Logical Operator1'
   */
  spineThreshold = airbag_13Hz_U.spineTimeThresholdSec1;
  if (rtIsInfF(airbag_13Hz_U.spineTimeThresholdSec1) || rtIsNaNF
      (airbag_13Hz_U.spineTimeThresholdSec1)) {
    spineThreshold = 60.0F;
  } else if (airbag_13Hz_U.spineTimeThresholdSec1 <= 0.0F) {
    spineThreshold = 60.0F;
  }

  b_weightedY = airbag_13Hz_U.bumpTimeThresholdSec1;
  if (rtIsInfF(airbag_13Hz_U.bumpTimeThresholdSec1) || rtIsNaNF
      (airbag_13Hz_U.bumpTimeThresholdSec1)) {
    b_weightedY = 3.0F;
  } else if (airbag_13Hz_U.bumpTimeThresholdSec1 <= 0.0F) {
    b_weightedY = 3.0F;
  }

  spineDeadband = airbag_13Hz_U.spineBiasDeadband1;
  if (rtIsInfF(airbag_13Hz_U.spineBiasDeadband1) || rtIsNaNF
      (airbag_13Hz_U.spineBiasDeadband1)) {
    spineDeadband = 0.5F;
  } else if (airbag_13Hz_U.spineBiasDeadband1 <= 0.0F) {
    spineDeadband = 0.5F;
  }

  b_pressure = airbag_13Hz_U.sickForwardMinMm1;
  if (rtIsInfF(airbag_13Hz_U.sickForwardMinMm1) || rtIsNaNF
      (airbag_13Hz_U.sickForwardMinMm1)) {
    b_pressure = 1.5F;
  } else if (airbag_13Hz_U.sickForwardMinMm1 <= 0.0F) {
    b_pressure = 1.5F;
  }

  dyNew = airbag_13Hz_U.sickBackDropRatio1;
  if (rtIsInfF(airbag_13Hz_U.sickBackDropRatio1) || rtIsNaNF
      (airbag_13Hz_U.sickBackDropRatio1)) {
    dyNew = 0.8F;
  } else if ((airbag_13Hz_U.sickBackDropRatio1 <= 0.0F) ||
             (airbag_13Hz_U.sickBackDropRatio1 >= 1.0F)) {
    dyNew = 0.8F;
  }

  addedEdgeLength = airbag_13Hz_U.sickPairWindowSec1;
  if (rtIsInfF(airbag_13Hz_U.sickPairWindowSec1) || rtIsNaNF
      (airbag_13Hz_U.sickPairWindowSec1)) {
    addedEdgeLength = 5.0F;
  } else if (airbag_13Hz_U.sickPairWindowSec1 <= 0.0F) {
    addedEdgeLength = 5.0F;
  }

  pathIncrement = airbag_13Hz_U.bumpMinVelocity1;
  if (rtIsInfF(airbag_13Hz_U.bumpMinVelocity1) || rtIsNaNF
      (airbag_13Hz_U.bumpMinVelocity1)) {
    pathIncrement = 4.0F;
  } else if (airbag_13Hz_U.bumpMinVelocity1 <= 0.0F) {
    pathIncrement = 4.0F;
  }

  bumpRmsMax = airbag_13Hz_U.bumpMaxRms1;
  if (rtIsInfF(airbag_13Hz_U.bumpMaxRms1) || rtIsNaNF(airbag_13Hz_U.bumpMaxRms1))
  {
    bumpRmsMax = 1.2F;
  } else if (airbag_13Hz_U.bumpMaxRms1 <= 0.0F) {
    bumpRmsMax = 1.2F;
  }

  bumpRangeMax = airbag_13Hz_U.bumpMaxRangeMm1;
  if (rtIsInfF(airbag_13Hz_U.bumpMaxRangeMm1) || rtIsNaNF
      (airbag_13Hz_U.bumpMaxRangeMm1)) {
    bumpRangeMax = 25.0F;
  } else if (airbag_13Hz_U.bumpMaxRangeMm1 <= 0.0F) {
    bumpRangeMax = 25.0F;
  }

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
  } else {
    newReason = !rtIsInfF(adoptionFrequency);
    manualNow = (newReason && (adoptionFrequency >= 100.0F));
    rtb_stateChanged = ((!rtIsInfF(rtb_cushionSum_a)) && (rtb_cushionSum_a >=
      200.0F));
    if (airbag_13Hz_DW.pHistoryValid == 0.0F) {
      airbag_13Hz_DW.pForwardRefX = rtb_cop_x;
      airbag_13Hz_DW.pForwardAge = 0.0F;
      airbag_13Hz_DW.pBackPeakSum = adoptionFrequency;
      airbag_13Hz_DW.pBackPeakAge = 0.0F;
      airbag_13Hz_DW.pHistoryValid = 1.0F;
    }

    guard1 = false;
    guard2 = false;
    if (manualNow && ((!rtIsInfF(rtb_backrest_cop_y)) && (!rtIsNaNF
          (rtb_backrest_cop_y)))) {
      if (rtb_backrest_cop_y - 3.5F > spineDeadband) {
        i = 1;
        guard2 = true;
      } else if (rtb_backrest_cop_y - 3.5F < -spineDeadband) {
        i = -1;
        guard2 = true;
      } else {
        guard1 = true;
      }
    } else {
      guard1 = true;
    }

    if (guard2) {
      airbag_13Hz_DW.pSpineNeutralSec = 0.0F;
      if (i == airbag_13Hz_DW.pSpineDir) {
        airbag_13Hz_DW.pSpineBiasSec += 0.0769230798F;
      } else {
        airbag_13Hz_DW.pSpineDir = (real32_T)i;
        airbag_13Hz_DW.pSpineBiasSec = 0.0769230798F;
        airbag_13Hz_DW.pSpineActive = 0.0F;
        airbag_13Hz_DW.pSpineActionTimer = 0.0F;
      }

      if ((airbag_13Hz_DW.pSpineBiasSec >= spineThreshold) &&
          (airbag_13Hz_DW.pSpineActive == 0.0F)) {
        airbag_13Hz_DW.pSpineActive = 1.0F;
        airbag_13Hz_DW.pSpineActionTimer = 2.0F;
      }
    }

    if (guard1) {
      airbag_13Hz_DW.pSpineNeutralSec += 0.0769230798F;
      if ((airbag_13Hz_DW.pSpineNeutralSec >= 5.0F) || (!manualNow)) {
        airbag_13Hz_DW.pSpineBiasSec = 0.0F;
        airbag_13Hz_DW.pSpineDir = 0.0F;
        airbag_13Hz_DW.pSpineActive = 0.0F;
        airbag_13Hz_DW.pSpineActionTimer = 0.0F;
      }
    }

    rtb_backrest_cop_y = fmaxf(rtb_delta_x, rtb_delta_y);
    if (rtb_stateChanged && (rtb_isStable == 1) && ((!rtIsInfF(rtb_avg_velocity))
         && (!rtIsNaNF(rtb_avg_velocity)) && ((!rtIsInfF(rtb_rms_displacement)) &&
          (!rtIsNaNF(rtb_rms_displacement)) && ((!rtIsInfF(rtb_backrest_cop_y)) &&
           (!rtIsNaNF(rtb_backrest_cop_y)) && ((rtb_avg_velocity >=
             pathIncrement) && (rtb_rms_displacement <= bumpRmsMax) &&
            (rtb_backrest_cop_y <= bumpRangeMax)))))) {
      airbag_13Hz_DW.pBumpClearSec = 0.0F;
      if (airbag_13Hz_DW.pBumpLatched == 0.0F) {
        airbag_13Hz_DW.pBumpDetectSec += 0.0769230798F;
        if (airbag_13Hz_DW.pBumpDetectSec >= b_weightedY) {
          airbag_13Hz_DW.pBumpLatched = 1.0F;
          airbag_13Hz_DW.pBumpActionTimer = 2.0F;
        }
      }
    } else {
      airbag_13Hz_DW.pBumpClearSec += 0.0769230798F;
      if (airbag_13Hz_DW.pBumpLatched == 0.0F) {
        airbag_13Hz_DW.pBumpDetectSec -= 0.15384616F;
        if (airbag_13Hz_DW.pBumpDetectSec < 0.0F) {
          airbag_13Hz_DW.pBumpDetectSec = 0.0F;
        }
      } else if (airbag_13Hz_DW.pBumpClearSec >= 1.0F) {
        airbag_13Hz_DW.pBumpLatched = 0.0F;
        airbag_13Hz_DW.pBumpDetectSec = 0.0F;
      }
    }

    if (rtb_stateChanged && ((!rtIsInfF(rtb_cop_x)) && (!rtIsNaNF(rtb_cop_x))))
    {
      airbag_13Hz_DW.pForwardAge += 0.0769230798F;
      if (rtIsInfF(airbag_13Hz_U.cushionForwardSign1) || rtIsNaNF
          (airbag_13Hz_U.cushionForwardSign1)) {
        i = -1;
      } else if (airbag_13Hz_U.cushionForwardSign1 == 0.0F) {
        i = -1;
      } else if (airbag_13Hz_U.cushionForwardSign1 > 0.0F) {
        i = 1;
      } else {
        i = -1;
      }

      airbag_13Hz_Y.cushionForwardMoveMm1 = (rtb_cop_x -
        airbag_13Hz_DW.pForwardRefX) * (real32_T)i * 7.0F;
      if (airbag_13Hz_Y.cushionForwardMoveMm1 < -1.0F) {
        airbag_13Hz_DW.pForwardRefX = rtb_cop_x;
        airbag_13Hz_DW.pForwardAge = 0.0F;
        airbag_13Hz_Y.cushionForwardMoveMm1 = 0.0F;
      }
    } else {
      airbag_13Hz_DW.pForwardRefX = rtb_cop_x;
      airbag_13Hz_DW.pForwardAge = 0.0F;
    }

    if (newReason && (adoptionFrequency >= airbag_13Hz_DW.pBackPeakSum)) {
      airbag_13Hz_DW.pBackPeakSum = adoptionFrequency;
      airbag_13Hz_DW.pBackPeakAge = 0.0F;
    } else {
      airbag_13Hz_DW.pBackPeakAge += 0.0769230798F;
      if (airbag_13Hz_DW.pBackPeakAge >= 2.5F) {
        if (newReason) {
          if (adoptionFrequency > 0.0F) {
            airbag_13Hz_DW.pBackPeakSum = adoptionFrequency;
          } else {
            airbag_13Hz_DW.pBackPeakSum = 0.0F;
          }
        } else {
          airbag_13Hz_DW.pBackPeakSum = 0.0F;
        }

        airbag_13Hz_DW.pBackPeakAge = 0.0F;
      }
    }

    if ((!rtIsInfF(airbag_13Hz_DW.pBackPeakSum)) && (!rtIsNaNF
         (airbag_13Hz_DW.pBackPeakSum)) && (airbag_13Hz_DW.pBackPeakSum > 0.0F) &&
        newReason) {
      airbag_13Hz_Y.backrestDropRatio1 = adoptionFrequency /
        airbag_13Hz_DW.pBackPeakSum;
    }

    if ((airbag_13Hz_DW.pBackPeakSum >= 100.0F) && (newReason &&
         ((adoptionFrequency <= 80.0F) || (airbag_13Hz_Y.backrestDropRatio1 <=
           dyNew)))) {
      airbag_13Hz_DW.pBackDropWindow = addedEdgeLength;
    }

    if ((airbag_13Hz_DW.pBackDropWindow > 0.0F) && rtb_stateChanged &&
        (airbag_13Hz_Y.cushionForwardMoveMm1 >= b_pressure) &&
        (airbag_13Hz_DW.pSickEventGap <= 0.0F)) {
      airbag_13Hz_DW.pSickEventCount++;
      airbag_13Hz_DW.pSickEventGap = 2.0F;
      airbag_13Hz_DW.pSickCountAge = 0.0F;
      airbag_13Hz_DW.pBackDropWindow = 0.0F;
      airbag_13Hz_DW.pForwardRefX = rtb_cop_x;
      airbag_13Hz_DW.pForwardAge = 0.0F;
      airbag_13Hz_DW.pBackPeakSum = adoptionFrequency;
      airbag_13Hz_DW.pBackPeakAge = 0.0F;
      if (airbag_13Hz_DW.pSickEventCount >= 2.0F) {
        airbag_13Hz_DW.pSickPromptTimer = 10.0F;
        airbag_13Hz_DW.pSickEventCount = 0.0F;
      }
    }

    if (airbag_13Hz_DW.pSickEventCount > 0.0F) {
      airbag_13Hz_DW.pSickCountAge += 0.0769230798F;
      if (airbag_13Hz_DW.pSickCountAge >= 300.0F) {
        airbag_13Hz_DW.pSickEventCount = 0.0F;
        airbag_13Hz_DW.pSickCountAge = 0.0F;
      }
    }

    if (airbag_13Hz_DW.pForwardAge >= 5.0F) {
      airbag_13Hz_DW.pForwardRefX = rtb_cop_x;
      airbag_13Hz_DW.pForwardAge = 0.0F;
    }

    /* Outport: '<Root>/spineProtectActive1' incorporates:
     *  Inport: '<Root>/ cushionForwardSign1'
     */
    airbag_13Hz_Y.spineProtectActive1 = airbag_13Hz_DW.pSpineActive;
    if (airbag_13Hz_DW.pSpineActive == 1.0F) {
      /* Outport: '<Root>/spineProtectSide1' */
      airbag_13Hz_Y.spineProtectSide1 = airbag_13Hz_DW.pSpineDir;
      newWriteIndex = 1;
    }

    /* Outport: '<Root>/bumpReliefActive1' */
    airbag_13Hz_Y.bumpReliefActive1 = airbag_13Hz_DW.pBumpLatched;
    if (airbag_13Hz_DW.pBumpLatched == 1.0F) {
      newWriteIndex += 2;
    }

    if (airbag_13Hz_DW.pSickPromptTimer > 0.0F) {
      /* Outport: '<Root>/motionSicknessActive1' */
      airbag_13Hz_Y.motionSicknessActive1 = 1.0F;
      newWriteIndex += 4;
    }

    if (airbag_13Hz_DW.pSpineActionTimer > 0.0F) {
      if (airbag_13Hz_DW.pSpineDir < 0.0F) {
        rtb_healthSideWingLeftAction = 1;
      } else if (airbag_13Hz_DW.pSpineDir > 0.0F) {
        rtb_healthSideWingRightAction = 1;
      }
    }

    if (airbag_13Hz_DW.pBumpActionTimer > 0.0F) {
      rtb_healthSideWingLeftAction = 1;
      rtb_healthSideWingRightAction = 1;
    }

    /* Outport: '<Root>/spineBiasSeconds1' */
    airbag_13Hz_Y.spineBiasSeconds1 = airbag_13Hz_DW.pSpineBiasSec;

    /* Outport: '<Root>/bumpDetectSeconds1' */
    airbag_13Hz_Y.bumpDetectSeconds1 = airbag_13Hz_DW.pBumpDetectSec;

    /* Outport: '<Root>/sickEventCount1' */
    airbag_13Hz_Y.sickEventCount1 = airbag_13Hz_DW.pSickEventCount;
    if (airbag_13Hz_DW.pSpineActionTimer > 0.0F) {
      airbag_13Hz_DW.pSpineActionTimer -= 0.0769230798F;
      if (airbag_13Hz_DW.pSpineActionTimer < 0.0F) {
        airbag_13Hz_DW.pSpineActionTimer = 0.0F;
      }
    }

    if (airbag_13Hz_DW.pBumpActionTimer > 0.0F) {
      airbag_13Hz_DW.pBumpActionTimer -= 0.0769230798F;
      if (airbag_13Hz_DW.pBumpActionTimer < 0.0F) {
        airbag_13Hz_DW.pBumpActionTimer = 0.0F;
      }
    }

    if (airbag_13Hz_DW.pBackDropWindow > 0.0F) {
      airbag_13Hz_DW.pBackDropWindow -= 0.0769230798F;
      if (airbag_13Hz_DW.pBackDropWindow < 0.0F) {
        airbag_13Hz_DW.pBackDropWindow = 0.0F;
      }
    }

    if (airbag_13Hz_DW.pSickPromptTimer > 0.0F) {
      airbag_13Hz_DW.pSickPromptTimer -= 0.0769230798F;
      if (airbag_13Hz_DW.pSickPromptTimer < 0.0F) {
        airbag_13Hz_DW.pSickPromptTimer = 0.0F;
      }
    }

    if (airbag_13Hz_DW.pSickEventGap > 0.0F) {
      airbag_13Hz_DW.pSickEventGap -= 0.0769230798F;
      if (airbag_13Hz_DW.pSickEventGap < 0.0F) {
        airbag_13Hz_DW.pSickEventGap = 0.0F;
      }
    }
  }

  /* MATLAB Function: '<Root>/气囊控制协议1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion20'
   *  DataTypeConversion: '<Root>/Data Type Conversion25'
   *  Inport: '<Root>/adoption_frequency1'
   *  Inport: '<Root>/deflation_time1'
   *  Inport: '<Root>/holding_time1'
   *  Inport: '<Root>/inflation_time3'
   *  Inport: '<Root>/welcomeHipTime1'
   *  Inport: '<Root>/welcomeLegTime1'
   *  Inport: '<Root>/welcomeLumbarTime1'
   *  Inport: '<Root>/welcomeSideWingTime1'
   *  MATLAB Function: '<Root>/品味系数1'
   *  MATLAB Function: '<Root>/活体检测1'
   */
  rtb_cop_x = airbag_13Hz_U.welcomeSideWingTime1;
  rtb_backrest_cop_y = airbag_13Hz_U.welcomeLumbarTime1;
  adoptionFrequency = airbag_13Hz_U.welcomeHipTime1;
  rtb_cushionSum_a = airbag_13Hz_U.welcomeLegTime1;
  if (airbag_13Hz_U.welcomeSideWingTime1 <= 0.0F) {
    rtb_cop_x = 2.0F;
  }

  if (airbag_13Hz_U.welcomeLumbarTime1 <= 0.0F) {
    rtb_backrest_cop_y = 3.0F;
  }

  if (airbag_13Hz_U.welcomeHipTime1 <= 0.0F) {
    adoptionFrequency = 3.0F;
  }

  if (airbag_13Hz_U.welcomeLegTime1 <= 0.0F) {
    rtb_cushionSum_a = 2.0F;
  }

  airbag_13Hz_Y.inflation_time_out1 = ((rtb_cop_x + rtb_backrest_cop_y) +
    adoptionFrequency) + rtb_cushionSum_a;
  airbag_13Hz_Y.inflation_time1_out1 = fmaxf(0.0F, airbag_13Hz_U.inflation_time3);
  airbag_13Hz_Y.holding_time_out1 = fmaxf(0.0F, airbag_13Hz_U.holding_time1);
  airbag_13Hz_Y.deflation_time_out1 = fmaxf(0.0F, airbag_13Hz_U.deflation_time1);
  rtb_cushionSum_a = fmaxf(1.0F, airbag_13Hz_U.adoption_frequency1);
  manualNow = ((real32_T)rtb_isOccupied > 0.5F);
  rtb_isOccupied = (rtb_massageEnable >= 0.5F);
  newReason = (rtb_reasonCode != airbag_13Hz_DW.pPrevReasonCode);
  if ((newReason && (rtb_reasonCode == 4)) || ((rtb_reasonCode == 4) &&
       (airbag_13Hz_DW.mode != 4.0F))) {
    if (airbag_13Hz_DW.mode == 1.0F) {
      airbag_13Hz_DW.mode = 4.0F;
      airbag_13Hz_DW.elapsed_time = fmaxf(0.0F,
        airbag_13Hz_Y.deflation_time_out1 * rtb_cushionSum_a -
        airbag_13Hz_DW.elapsed_time);
    } else {
      airbag_13Hz_DW.mode = 4.0F;
      airbag_13Hz_DW.elapsed_time = 0.0F;
    }
  } else if (newReason && tmp_1) {
    airbag_13Hz_DW.mode = 1.0F;
    airbag_13Hz_DW.elapsed_time = 0.0F;
  }

  living = (manualNow && airbag_13Hz_DW.unlocked && ((airbag_13Hz_DW.mode ==
              2.0F) || (airbag_13Hz_DW.mode == 3.0F)) && (!rtb_isOccupied));
  gapActive = (((real32_T)b_requestIdle_tmp > 0.5F) && (rtb_status[2] > 0.5F) &&
               ((!((real32_T)gapActive > 0.5F)) && (!(rtb_status[3] > 0.5F))) &&
               living);
  rtb_massageEnable = 0;
  if (rtb_leftAction == 1) {
    rtb_massageEnable = 3;
  } else if (rtb_leftAction == 2) {
    rtb_massageEnable = 4;
  }

  rtb_leftAction = 0;
  if (rtb_rightAction == 1) {
    rtb_leftAction = 3;
  } else if (rtb_rightAction == 2) {
    rtb_leftAction = 4;
  }

  rtb_rightAction = 0;
  if (rtb_leftAction_h == 1) {
    rtb_rightAction = 3;
  } else if (rtb_leftAction_h == 2) {
    rtb_rightAction = 4;
  }

  rtb_isStable = 0;
  if (xpageoffset == 1) {
    rtb_isStable = 3;
  } else if (xpageoffset == 2) {
    rtb_isStable = 4;
  }

  LumbarlumbarGear = 0;
  if (idx == 1) {
    LumbarlumbarGear = 3;
  } else if (idx == 2) {
    LumbarlumbarGear = 4;
  }

  xpageoffset = 0;
  if (rtb_healthSideWingLeftAction == 1) {
    xpageoffset = 3;
  }

  rtb_leftAction_h = 0;
  if (rtb_healthSideWingRightAction == 1) {
    rtb_leftAction_h = 3;
  }

  memset(&airbag_13Hz_Y.frame1[0], 0, 55U * sizeof(real32_T));
  airbag_13Hz_Y.frame1[0] = 31.0F;
  switch ((int32_T)airbag_13Hz_DW.mode) {
   case 1:
    rtb_massageEnable = 3;
    rtb_cop_x *= rtb_cushionSum_a;
    rtb_backrest_cop_y = rtb_backrest_cop_y * rtb_cushionSum_a + rtb_cop_x;
    if (airbag_13Hz_DW.elapsed_time < rtb_cop_x) {
      rtb_massageEnable = 0;
    } else if (airbag_13Hz_DW.elapsed_time < rtb_backrest_cop_y) {
      rtb_massageEnable = 1;
    } else if (airbag_13Hz_DW.elapsed_time < adoptionFrequency *
               rtb_cushionSum_a + rtb_backrest_cop_y) {
      rtb_massageEnable = 2;
    }

    rtb_massageEnable = (rtb_massageEnable << 1) + 3;
    for (rtb_rightAction = 0; rtb_rightAction < 24; rtb_rightAction++) {
      idx = rtb_rightAction << 1;
      airbag_13Hz_Y.frame1[idx + 1] = (real32_T)rtb_rightAction + 1.0F;
      if (((rtb_rightAction + 1 == rtb_massageEnable) || (rtb_rightAction ==
            rtb_massageEnable)) && airbag_13Hz_DW.unlocked && manualNow) {
        airbag_13Hz_Y.frame1[idx + 2] = 3.0F;
      } else {
        airbag_13Hz_Y.frame1[idx + 2] = 0.0F;
      }
    }

    if (airbag_13Hz_DW.unlocked && manualNow) {
      airbag_13Hz_DW.elapsed_time++;
      if (airbag_13Hz_DW.elapsed_time >= airbag_13Hz_Y.inflation_time_out1 *
          rtb_cushionSum_a) {
        airbag_13Hz_DW.mode = 2.0F;
        airbag_13Hz_DW.elapsed_time = 0.0F;
      }
    } else {
      airbag_13Hz_DW.elapsed_time = 0.0F;
    }
    break;

   case 2:
    for (i = 0; i < 24; i++) {
      idx = (i << 1) + 1;
      airbag_13Hz_Y.frame1[idx] = (real32_T)i + 1.0F;
      airbag_13Hz_Y.frame1[idx + 1] = 0.0F;
    }

    if ((real32_T)gapActive > 0.5F) {
      airbag_13Hz_applyAdaptiveGears(airbag_13Hz_Y.frame1, (real32_T)
        rtb_rightAction, (real32_T)rtb_isStable, (real32_T)LumbarlumbarGear,
        (real32_T)rtb_massageEnable, (real32_T)rtb_leftAction);
      airbag_13Hz_DW.elapsed_time++;
      if (airbag_13Hz_DW.elapsed_time >= airbag_13Hz_Y.holding_time_out1 *
          rtb_cushionSum_a) {
        airbag_13Hz_DW.mode = 3.0F;
        airbag_13Hz_DW.elapsed_time = 0.0F;
      }
    }
    break;

   case 3:
    for (i = 0; i < 24; i++) {
      idx = (i << 1) + 1;
      airbag_13Hz_Y.frame1[idx] = (real32_T)i + 1.0F;
      airbag_13Hz_Y.frame1[idx + 1] = 0.0F;
    }

    if ((real32_T)gapActive > 0.5F) {
      airbag_13Hz_applyAdaptiveGears(airbag_13Hz_Y.frame1, (real32_T)
        rtb_rightAction, (real32_T)rtb_isStable, (real32_T)LumbarlumbarGear,
        (real32_T)rtb_massageEnable, (real32_T)rtb_leftAction);
      airbag_13Hz_Y.frame1[14] = 3.0F;
      airbag_13Hz_Y.frame1[16] = 3.0F;
      airbag_13Hz_DW.elapsed_time++;
      if (airbag_13Hz_DW.elapsed_time >= airbag_13Hz_Y.inflation_time1_out1 *
          rtb_cushionSum_a) {
        airbag_13Hz_DW.mode = 2.0F;
        airbag_13Hz_DW.elapsed_time = 0.0F;
      }
    } else {
      airbag_13Hz_DW.mode = 2.0F;
      airbag_13Hz_DW.elapsed_time = 0.0F;
    }
    break;

   case 4:
    for (rtb_massageEnable = 0; rtb_massageEnable < 24; rtb_massageEnable++) {
      idx = (rtb_massageEnable << 1) + 1;
      airbag_13Hz_Y.frame1[idx] = (real32_T)rtb_massageEnable + 1.0F;
      airbag_13Hz_Y.frame1[idx + 1] = 4.0F;
    }

    airbag_13Hz_DW.elapsed_time++;
    if (airbag_13Hz_DW.elapsed_time >= airbag_13Hz_Y.deflation_time_out1 *
        rtb_cushionSum_a) {
      airbag_13Hz_DW.mode = 0.0F;
      airbag_13Hz_DW.elapsed_time = 0.0F;
    }
    break;

   default:
    airbag_13Hz_DW.mode = 0.0F;
    airbag_13Hz_DW.elapsed_time = 0.0F;
    for (rtb_massageEnable = 0; rtb_massageEnable < 24; rtb_massageEnable++) {
      idx = (rtb_massageEnable << 1) + 1;
      airbag_13Hz_Y.frame1[idx] = (real32_T)rtb_massageEnable + 1.0F;
      airbag_13Hz_Y.frame1[idx + 1] = 0.0F;
    }
    break;
  }

  newReason = (living && ((airbag_13Hz_DW.mode == 2.0F) || (airbag_13Hz_DW.mode ==
    3.0F)));
  if (newReason) {
    if (xpageoffset != 0) {
      airbag_13Hz_Y.frame1[8] = (real32_T)xpageoffset;
    }

    if (rtb_leftAction_h != 0) {
      airbag_13Hz_Y.frame1[6] = (real32_T)rtb_leftAction_h;
    }
  }

  if ((airbag_13Hz_DW.pRequest[0] > 0.5F) && newReason) {
    if (airbag_13Hz_DW.pRequest[2] > 0.0F) {
      rtb_massageEnable = 3;
    } else {
      rtb_massageEnable = 4;
    }

    for (idx = 0; idx < 10; idx++) {
      if (deflationSeconds == 1.0F) {
        newReason = ((idx == 0) || (idx + 1 == 2));
      } else if (deflationSeconds == 2.0F) {
        newReason = ((idx + 1 == 3) || (idx + 1 == 4));
      } else if (deflationSeconds == 3.0F) {
        newReason = ((idx + 1 == 5) || (idx + 1 == 6));
      } else if (deflationSeconds == 4.0F) {
        newReason = ((idx + 1 == 7) || (idx + 1 == 8));
      } else {
        newReason = ((deflationSeconds == 5.0F) && ((idx + 1 == 9) || (idx + 1 ==
          10)));
      }

      if ((deflationSeconds == 0.0F) || newReason) {
        airbag_13Hz_Y.frame1[(idx << 1) + 2] = (real32_T)rtb_massageEnable;
      }
    }
  }

  if ((rtb_hipInflateRequest > 0.5F) && (airbag_13Hz_DW.mode != 1.0F) &&
      (airbag_13Hz_DW.mode != 4.0F)) {
    airbag_13Hz_Y.frame1[14] = 3.0F;
    airbag_13Hz_Y.frame1[16] = 3.0F;
  }

  if (rtb_isOccupied && (airbag_13Hz_DW.mode != 1.0F) && (airbag_13Hz_DW.mode !=
       4.0F)) {
    for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 10;
         rtb_hipInflateRequest++) {
      airbag_13Hz_Y.frame1[(rtb_hipInflateRequest << 1) + 2] = 0.0F;
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 14;
       rtb_hipInflateRequest++) {
    rtb_massageEnable = ((rtb_hipInflateRequest + 10) << 1) + 2;
    switch (rtb_massageGears[rtb_hipInflateRequest]) {
     case 4:
      airbag_13Hz_Y.frame1[rtb_massageEnable] = 4.0F;
      break;

     case 3:
      if (rtb_isOccupied && airbag_13Hz_DW.unlocked && (airbag_13Hz_DW.mode !=
           1.0F)) {
        airbag_13Hz_Y.frame1[rtb_massageEnable] = 3.0F;
      }
      break;
    }
  }

  for (rtb_hipInflateRequest = 0; rtb_hipInflateRequest < 24;
       rtb_hipInflateRequest++) {
    idx = (rtb_hipInflateRequest << 1) + 2;
    deflationSeconds = airbag_13Hz_DW.pPrevGears[rtb_hipInflateRequest];
    if (((deflationSeconds == 3.0F) || (deflationSeconds == 4.0F)) &&
        (airbag_13Hz_Y.frame1[idx] != deflationSeconds)) {
      airbag_13Hz_Y.frame1[idx] = 0.0F;
    }

    airbag_13Hz_DW.pPrevGears[rtb_hipInflateRequest] = airbag_13Hz_Y.frame1[idx];
  }

  airbag_13Hz_Y.frame1[49] = 0.0F;
  airbag_13Hz_Y.frame1[50] = 0.0F;
  airbag_13Hz_Y.frame1[51] = 170.0F;
  airbag_13Hz_Y.frame1[52] = 85.0F;
  airbag_13Hz_Y.frame1[53] = 3.0F;
  airbag_13Hz_Y.frame1[54] = 153.0F;
  airbag_13Hz_DW.pPrevReasonCode = rtb_reasonCode;

  /* MATLAB Function: '<Root>/断电保存品味数据 1' incorporates:
   *  MATLAB Function: '<Root>/品味系数1'
   *  UnitDelay: '<Root>/Unit Delay2'
   */
  if (rtb_nvmWrite[0] == 1.0F) {
    airbag_13Hz_DW.UnitDelay2_DSTATE[0] = 1.0F;
    for (i = 0; i < 14; i++) {
      airbag_13Hz_DW.UnitDelay2_DSTATE[i + 1] = rtb_nvmWrite[i + 1];
    }
  } else if (rtb_nvmWrite[0] == 2.0F) {
    /* Update for UnitDelay: '<Root>/Unit Delay2' */
    for (i = 0; i < 15; i++) {
      airbag_13Hz_DW.UnitDelay2_DSTATE[i] = 0.0F;
    }
  } else if (rtb_nvmWrite[0] == 3.0F) {
    airbag_13Hz_DW.UnitDelay2_DSTATE[14] = (real32_T)
      (airbag_13Hz_DW.pAdaptiveOff > 0.5F);
  }

  /* End of MATLAB Function: '<Root>/断电保存品味数据 1' */

  /* Outport: '<Root>/healthReasonCode1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_Y.healthReasonCode1 = (real32_T)newWriteIndex;

  /* Outport: '<Root>/thresholdPassed1' incorporates:
   *  MATLAB Function: '<Root>/腰托气囊控制逻辑1'
   */
  airbag_13Hz_Y.thresholdPassed1 = (real32_T)nvmCmd;

  /* Outport: '<Root>/backTotalThreshold_out1' incorporates:
   *  Inport: '<Root>/backTotalThreshold1'
   */
  airbag_13Hz_Y.backTotalThreshold_out1 = airbag_13Hz_U.backTotalThreshold1;

  /* Outport: '<Root>/reasonCode1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion25'
   *  MATLAB Function: '<Root>/品味系数1'
   */
  airbag_13Hz_Y.reasonCode1 = rtb_reasonCode;

  /* Outport: '<Root>/isLivingRaw1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_Y.isLivingRaw1 = airbag_13Hz_DW.latestRaw;

  /* Outport: '<Root>/detectionTriggered1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_Y.detectionTriggered1 = isStill;

  /* Outport: '<Root>/queueLength1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_Y.queueLength1 = (real32_T)airbag_13Hz_DW.livingQueueLen;

  /* Outport: '<Root>/detectorEnabled_out1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_Y.detectorEnabled_out1 = 1.0F;

  /* Outport: '<Root>/isLiving1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_Y.isLiving1 = (real32_T)(microState == 3);

  /* Outport: '<Root>/isStatic1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_Y.isStatic1 = (real32_T)(microState == 2);

  /* Outport: '<Root>/isFullSeat1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion21'
   *  MATLAB Function: '<Root>/入座处理1'
   */
  airbag_13Hz_Y.isFullSeat1 = (real32_T)(airbag_13Hz_DW.pState_i == 2);

  /* Outport: '<Root>/offCounter1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion22'
   *  MATLAB Function: '<Root>/入座处理1'
   */
  airbag_13Hz_Y.offCounter1 = (real32_T)airbag_13Hz_DW.pOffCounter;

  /* Outport: '<Root>/resetCounter1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion23'
   *  MATLAB Function: '<Root>/入座处理1'
   */
  airbag_13Hz_Y.resetCounter1 = (real32_T)airbag_13Hz_DW.pResetCounter;

  /* Outport: '<Root>/backrestLostCounter1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion24'
   *  MATLAB Function: '<Root>/入座处理1'
   */
  airbag_13Hz_Y.backrestLostCounter1 = (real32_T)
    airbag_13Hz_DW.pBackrestLostCounter;

  /* Outport: '<Root>/frame_data_out1' incorporates:
   *  Inport: '<Root>/frame_data1'
   */
  memcpy(&airbag_13Hz_Y.frame_data_out1[0], &airbag_13Hz_U.frame_data1[0], 92U *
         sizeof(real32_T));

  /* Update for UnitDelay: '<Root>/Unit Delay3' incorporates:
   *  MATLAB Function: '<Root>/侧翼状态判定1'
   *  MATLAB Function: '<Root>/腰托气囊控制逻辑1'
   *  MATLAB Function: '<Root>/腿托气囊控制逻辑1'
   */
  airbag_13Hz_DW.UnitDelay3_DSTATE[0] = normalizeScale;
  airbag_13Hz_DW.UnitDelay3_DSTATE[1] = xtmp;
  airbag_13Hz_DW.UnitDelay3_DSTATE[2] = adjustCmd;
  airbag_13Hz_DW.UnitDelay3_DSTATE[3] = baseInflationSeconds;
}

/* Model initialize function */
void airbag_13Hz_initialize(void)
{
  {
    int32_T i;
    static const real32_T tmp[8] = { 1.3F, 0.9F, 0.7F, 1.3F, 0.35F, 0.85F, 0.5F,
      1.1F };

    /* SystemInitialize for MATLAB Function: '<Root>/活体检测1' */
    airbag_13Hz_DW.noiseBaseline = 0.33F;
    airbag_13Hz_DW.noiseDev = 0.1F;

    /* SystemInitialize for MATLAB Function: '<Root>/品味系数1' */
    for (i = 0; i < 8; i++) {
      airbag_13Hz_DW.pThresholds[i] = tmp[i];
    }

    /* End of SystemInitialize for MATLAB Function: '<Root>/品味系数1' */
  }
}

/* Model terminate function */
void airbag_13Hz_terminate(void)
{
  /* (no terminate code required) */
}

/*
 * File trailer for generated code.
 *
 * [EOF]
 */
