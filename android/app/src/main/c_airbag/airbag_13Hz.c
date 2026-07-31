/*
 * Academic License - for use in teaching, academic research, and meeting
 * course requirements at degree granting institutions only.  Not for
 * government, commercial, or other organizational use.
 *
 * File: airbag_13Hz_v2.c
 *
 * Code generated for Simulink model 'airbag_13Hz_v2'.
 *
 * Model version                  : 1.228
 * Simulink Coder version         : 25.2 (R2025b) 28-Jul-2025
 * C/C++ source code generated on : Fri Jul 31 17:31:09 2026
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
DW_airbag_13Hz_v2_T airbag_13Hz_v2_DW;

/* External inputs (root inport signals with default storage) */
ExtU_airbag_13Hz_v2_T airbag_13Hz_v2_U;

/* External outputs (root outports fed by signals with default storage) */
ExtY_airbag_13Hz_v2_T airbag_13Hz_v2_Y;

/* Real-time model */
static RT_MODEL_airbag_13Hz_v2_T airbag_13Hz_v2_M_;
RT_MODEL_airbag_13Hz_v2_T *const airbag_13Hz_v2_M = &airbag_13Hz_v2_M_;

/* Forward declaration for local functions */
static void airba_calculatePressureFeatures(const real32_T matrixIn[56],
  real32_T threshold, real32_T *originalSum, real32_T *filteredSum);
static real32_T airbag_13Hz_v2_sum(const real32_T x_data[], const int32_T
  *x_size);
static real32_T airbag_13Hz_v2_mean(const real32_T x_data[], const int32_T
  *x_size);
static int32_T airbag_13_combineVectorElements(const boolean_T x_data[], const
  int32_T *x_size);
static real32_T airbag_13Hz_v2_directionOf(real32_T b_value);
static boolean_T airbag_13Hz_v_allFinitePositive(const real32_T values[8]);
static boolean_T airbag_13Hz_v2_any(const boolean_T x[3]);
static void airbag_13Hz_v2_makeThresholds(real32_T lumbarRatio, real32_T
  wingRatio, real32_T leftLegRatio, real32_T rightLegRatio, real32_T thresholds
  [8]);
static void airbag_13Hz__applyAdaptiveGears(real32_T frame[55], real32_T
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

/* Function for MATLAB Function: '<Root>/活体检测1' */
static real32_T airbag_13Hz_v2_sum(const real32_T x_data[], const int32_T
  *x_size)
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
static real32_T airbag_13Hz_v2_mean(const real32_T x_data[], const int32_T
  *x_size)
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
static int32_T airbag_13_combineVectorElements(const boolean_T x_data[], const
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
      y += x_data[k - 1];
    }
  }

  return y;
}

/* Function for MATLAB Function: '<Root>/品味系数1' */
static real32_T airbag_13Hz_v2_directionOf(real32_T b_value)
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
static boolean_T airbag_13Hz_v_allFinitePositive(const real32_T values[8])
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
static boolean_T airbag_13Hz_v2_any(const boolean_T x[3])
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
static void airbag_13Hz_v2_makeThresholds(real32_T lumbarRatio, real32_T
  wingRatio, real32_T leftLegRatio, real32_T rightLegRatio, real32_T thresholds
  [8])
{
  real32_T leftCenter;
  real32_T lumbarCenter;
  real32_T rightCenter;
  real32_T wingCenter;
  lumbarCenter = lumbarRatio;
  if (rtIsInfF(lumbarRatio) || rtIsNaNF(lumbarRatio)) {
    lumbarCenter = 1.1F;
  } else if (lumbarRatio <= 0.0F) {
    lumbarCenter = 1.1F;
  }

  wingCenter = wingRatio;
  if (rtIsInfF(wingRatio) || rtIsNaNF(wingRatio)) {
    wingCenter = 1.0F;
  } else if (wingRatio <= 0.0F) {
    wingCenter = 1.0F;
  }

  leftCenter = leftLegRatio;
  if (rtIsInfF(leftLegRatio) || rtIsNaNF(leftLegRatio)) {
    leftCenter = 0.59F;
  } else if (leftLegRatio <= 0.0F) {
    leftCenter = 0.59F;
  }

  rightCenter = rightLegRatio;
  if (rtIsInfF(rightLegRatio) || rtIsNaNF(rightLegRatio)) {
    rightCenter = 0.799999952F;
  } else if (rightLegRatio <= 0.0F) {
    rightCenter = 0.799999952F;
  }

  thresholds[0] = lumbarCenter + 0.3F;
  thresholds[1] = fmaxf(0.1F, lumbarCenter - 0.3F);
  thresholds[2] = fmaxf(0.1F, wingCenter - 0.2F);
  thresholds[3] = wingCenter + 0.2F;
  thresholds[4] = fmaxf(0.1F, leftCenter - 0.2F);
  thresholds[5] = leftCenter + 0.2F;
  thresholds[6] = fmaxf(0.1F, rightCenter - 0.2F);
  thresholds[7] = rightCenter + 0.2F;
}

/* Function for MATLAB Function: '<Root>/气囊控制协议1' */
static void airbag_13Hz__applyAdaptiveGears(real32_T frame[55], real32_T
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
       case 10:
        frame[idx] = leftLegGear;
        break;

       case 9:
        frame[idx] = rightLegGear;
        break;
      }
    }
  }
}

/* Model step function */
void airbag_13Hz_v2_step(void)
{
  real_T r;
  real_T vlen_tmp;
  int32_T LumbarlumbarGear;
  int32_T i;
  int32_T idx;
  int32_T newWriteIndex;
  int32_T nvmCmd;
  int32_T rtb_action;
  int32_T rtb_healthSideWingLeftAction;
  int32_T rtb_healthSideWingRightAction;
  int32_T rtb_isStable;
  int32_T rtb_leftAction;
  int32_T rtb_leftAction_h;
  int32_T rtb_massageEnable;
  int32_T rtb_rightAction;
  real32_T backrestMatrix[56];
  real32_T backrestMatrix_data[56];
  real32_T e[56];
  real32_T cushionMatrix[48];
  real32_T d_x_data[26];
  real32_T rtb_nvmWrite[15];
  real32_T tmp_data_1[13];
  real32_T rtb_status[9];
  real32_T tmp[8];
  real32_T addedEdgeLength;
  real32_T adjustCmd;
  real32_T adoptionFrequency;
  real32_T avgPrev;
  real32_T b_pressure;
  real32_T b_weightedY;
  real32_T baseInflationSeconds;
  real32_T bumpRangeMax;
  real32_T bumpRmsMax;
  real32_T deflationSeconds;
  real32_T dyNew;
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
  int8_T candidate;
  int8_T pState;
  int8_T rtb_reasonCode;
  boolean_T b_validMask[56];
  boolean_T validMask[56];
  boolean_T queueValues_data[3];
  boolean_T queueValues_data_0[3];
  boolean_T b_requestIdle_tmp;
  boolean_T gapActive;
  boolean_T isStill;
  boolean_T living;
  boolean_T manualNow;
  boolean_T newReason;
  boolean_T requestIdle;
  boolean_T rtb_isOccupied;
  boolean_T rtb_stateChanged;
  static const int8_T d[5] = { 3, 5, 3, 5, 6 };

  static const int8_T c[5] = { 1, 1, 2, 2, 2 };

  static const int8_T f[5] = { 4, 6, 3, 5, 6 };

  static const int8_T e_0[5] = { 1, 1, 3, 3, 3 };

  static const int8_T f_0[4] = { 0, 1, 6, 7 };

  static const int8_T d_0[5] = { 6, 6, 9, 9, 9 };

  static const real32_T e_1[8] = { 1.5F, 0.7F, 0.7F, 1.3F, 0.48F, 0.7F, 0.64F,
    0.96F };

  static const int8_T g[5] = { 1, 0, -1, 5, 4 };

  static const int8_T h[5] = { 2, 2, 3, 3, 3 };

  boolean_T exitg1;
  boolean_T guard1;
  boolean_T guard2;
  boolean_T tmp_0;

  /* MATLAB Function: '<Root>/矩阵处理1' incorporates:
   *  Inport: '<Root>/frame_data1'
   */
  memset(&backrestMatrix[0], 0, 56U * sizeof(real32_T));
  memset(&cushionMatrix[0], 0, 48U * sizeof(real32_T));
  backrestMatrix[0] = airbag_13Hz_v2_U.frame_data1[0];
  backrestMatrix[49] = airbag_13Hz_v2_U.frame_data1[4];
  backrestMatrix[1] = airbag_13Hz_v2_U.frame_data1[1];
  backrestMatrix[50] = airbag_13Hz_v2_U.frame_data1[5];
  backrestMatrix[2] = airbag_13Hz_v2_U.frame_data1[2];
  backrestMatrix[51] = airbag_13Hz_v2_U.frame_data1[6];
  backrestMatrix[3] = airbag_13Hz_v2_U.frame_data1[3];
  backrestMatrix[52] = airbag_13Hz_v2_U.frame_data1[7];
  for (i = 0; i < 6; i++) {
    for (rtb_massageEnable = 0; rtb_massageEnable < 5; rtb_massageEnable++) {
      backrestMatrix[rtb_massageEnable + 7 * (i + 1)] =
        (&airbag_13Hz_v2_U.frame_data1[8])[6 * rtb_massageEnable + i];
    }
  }

  for (i = 0; i < 8; i++) {
    /* MATLAB Function: '<Root>/矩阵处理1' incorporates:
     *  Inport: '<Root>/frame_data1'
     */
    tmp[i] = airbag_13Hz_v2_U.frame_data1[i + 38];
  }

  /* MATLAB Function: '<Root>/矩阵处理1' incorporates:
   *  Inport: '<Root>/frame_data1'
   */
  for (i = 0; i < 4; i++) {
    newWriteIndex = (i + 2) * 7;
    backrestMatrix[newWriteIndex + 5] = tmp[i];
    backrestMatrix[newWriteIndex + 6] = tmp[i + 4];
  }

  for (i = 0; i < 5; i++) {
    cushionMatrix[i] = airbag_13Hz_v2_U.frame_data1[i + 46];
    cushionMatrix[i + 42] = airbag_13Hz_v2_U.frame_data1[i + 51];
  }

  for (i = 0; i < 6; i++) {
    for (rtb_massageEnable = 0; rtb_massageEnable < 6; rtb_massageEnable++) {
      cushionMatrix[rtb_massageEnable + 6 * (i + 1)] =
        (&airbag_13Hz_v2_U.frame_data1[56])[6 * rtb_massageEnable + i];
    }
  }

  for (nvmCmd = 0; nvmCmd < 8; nvmCmd++) {
    xtmp = backrestMatrix[7 * nvmCmd];
    newWriteIndex = 7 * nvmCmd + 6;
    backrestMatrix[7 * nvmCmd] = backrestMatrix[newWriteIndex];
    backrestMatrix[newWriteIndex] = xtmp;
    rtb_massageEnable = 7 * nvmCmd + 1;
    xtmp = backrestMatrix[rtb_massageEnable];
    newWriteIndex = 7 * nvmCmd + 5;
    backrestMatrix[rtb_massageEnable] = backrestMatrix[newWriteIndex];
    backrestMatrix[newWriteIndex] = xtmp;
    rtb_massageEnable = 7 * nvmCmd + 2;
    xtmp = backrestMatrix[rtb_massageEnable];
    newWriteIndex = 7 * nvmCmd + 4;
    backrestMatrix[rtb_massageEnable] = backrestMatrix[newWriteIndex];
    backrestMatrix[newWriteIndex] = xtmp;
  }

  for (newWriteIndex = 0; newWriteIndex < 4; newWriteIndex++) {
    for (rtb_massageEnable = 0; rtb_massageEnable < 6; rtb_massageEnable++) {
      rtb_action = 6 * newWriteIndex + rtb_massageEnable;
      xtmp = cushionMatrix[rtb_action];
      nvmCmd = (7 - newWriteIndex) * 6 + rtb_massageEnable;
      cushionMatrix[rtb_action] = cushionMatrix[nvmCmd];
      cushionMatrix[nvmCmd] = xtmp;
    }
  }

  for (newWriteIndex = 0; newWriteIndex < 8; newWriteIndex++) {
    xtmp = cushionMatrix[6 * newWriteIndex];
    nvmCmd = 6 * newWriteIndex + 5;
    cushionMatrix[6 * newWriteIndex] = cushionMatrix[nvmCmd];
    cushionMatrix[nvmCmd] = xtmp;
    rtb_massageEnable = 6 * newWriteIndex + 1;
    xtmp = cushionMatrix[rtb_massageEnable];
    nvmCmd = 6 * newWriteIndex + 4;
    cushionMatrix[rtb_massageEnable] = cushionMatrix[nvmCmd];
    cushionMatrix[nvmCmd] = xtmp;
    rtb_massageEnable = 6 * newWriteIndex + 2;
    xtmp = cushionMatrix[rtb_massageEnable];
    nvmCmd = 6 * newWriteIndex + 3;
    cushionMatrix[rtb_massageEnable] = cushionMatrix[nvmCmd];
    cushionMatrix[nvmCmd] = xtmp;
  }

  for (newWriteIndex = 0; newWriteIndex < 56; newWriteIndex++) {
    if (backrestMatrix[newWriteIndex] >= 250.0F) {
      backrestMatrix[newWriteIndex] = airbag_13Hz_v2_DW.pPrevB[newWriteIndex];
    }
  }

  for (newWriteIndex = 0; newWriteIndex < 48; newWriteIndex++) {
    if (cushionMatrix[newWriteIndex] >= 250.0F) {
      cushionMatrix[newWriteIndex] = airbag_13Hz_v2_DW.pPrevC[newWriteIndex];
    }
  }

  if (airbag_13Hz_v2_DW.pDone <= 0.5F) {
    isStill = true;
    for (newWriteIndex = 0; newWriteIndex < 56; newWriteIndex++) {
      isStill = ((!(fabsf(backrestMatrix[newWriteIndex] -
                          airbag_13Hz_v2_DW.pPrevB[newWriteIndex]) >= 8.0F)) &&
                 isStill);
    }

    for (newWriteIndex = 0; newWriteIndex < 48; newWriteIndex++) {
      isStill = ((!(fabsf(cushionMatrix[newWriteIndex] -
                          airbag_13Hz_v2_DW.pPrevC[newWriteIndex]) >= 8.0F)) &&
                 isStill);
    }

    if (isStill) {
      airbag_13Hz_v2_DW.pStable++;
    } else {
      airbag_13Hz_v2_DW.pStable = 0.0F;
    }

    if (airbag_13Hz_v2_DW.pStable >= 26.0F) {
      memcpy(&airbag_13Hz_v2_DW.pBaseB[0], &backrestMatrix[0], 56U * sizeof
             (real32_T));
      memcpy(&airbag_13Hz_v2_DW.pBaseC[0], &cushionMatrix[0], 48U * sizeof
             (real32_T));
      airbag_13Hz_v2_DW.pDone = 1.0F;
    }
  }

  memcpy(&airbag_13Hz_v2_DW.pPrevB[0], &backrestMatrix[0], 56U * sizeof(real32_T));
  memcpy(&airbag_13Hz_v2_DW.pPrevC[0], &cushionMatrix[0], 48U * sizeof(real32_T));
  if (airbag_13Hz_v2_DW.pDone > 0.5F) {
    for (nvmCmd = 0; nvmCmd < 56; nvmCmd++) {
      xtmp = backrestMatrix[nvmCmd] - airbag_13Hz_v2_DW.pBaseB[nvmCmd];
      backrestMatrix[nvmCmd] = xtmp;
      airbag_13Hz_v2_Y.backrestData1[nvmCmd] = fmaxf(0.0F, xtmp);
    }

    for (nvmCmd = 0; nvmCmd < 48; nvmCmd++) {
      xtmp = cushionMatrix[nvmCmd] - airbag_13Hz_v2_DW.pBaseC[nvmCmd];
      cushionMatrix[nvmCmd] = xtmp;
      airbag_13Hz_v2_Y.cushionData1[nvmCmd] = fmaxf(0.0F, xtmp);
    }
  } else {
    memset(&airbag_13Hz_v2_Y.backrestData1[0], 0, 56U * sizeof(real32_T));
    memset(&airbag_13Hz_v2_Y.cushionData1[0], 0, 48U * sizeof(real32_T));
  }

  for (i = 0; i < 6; i++) {
    airbag_13Hz_v2_Y.cushionData1[i] = 0.0F;
    airbag_13Hz_v2_Y.cushionData1[i + 42] = 0.0F;
  }

  for (newWriteIndex = 0; newWriteIndex < 5; newWriteIndex++) {
    i = ((d[newWriteIndex] - 1) * 6 + c[newWriteIndex]) - 1;
    baseInflationSeconds = airbag_13Hz_v2_Y.cushionData1[i];
    rtb_massageEnable = ((f[newWriteIndex] - 1) * 6 + e_0[newWriteIndex]) - 1;
    xtmp = airbag_13Hz_v2_Y.cushionData1[rtb_massageEnable];
    if (baseInflationSeconds >= xtmp) {
      airbag_13Hz_v2_Y.cushionData1[i] = fminf(baseInflationSeconds, xtmp) *
        0.5F + fmaxf(baseInflationSeconds, xtmp) * 0.5F;
    } else {
      airbag_13Hz_v2_Y.cushionData1[rtb_massageEnable] = fminf
        (baseInflationSeconds, xtmp) * 0.5F + fmaxf(baseInflationSeconds, xtmp) *
        0.5F;
    }
  }

  for (nvmCmd = 0; nvmCmd < 56; nvmCmd++) {
    if (airbag_13Hz_v2_Y.backrestData1[nvmCmd] < 5.0F) {
      airbag_13Hz_v2_Y.backrestData1[nvmCmd] = 0.0F;
    }
  }

  for (nvmCmd = 0; nvmCmd < 48; nvmCmd++) {
    if (airbag_13Hz_v2_Y.cushionData1[nvmCmd] < 5.0F) {
      airbag_13Hz_v2_Y.cushionData1[nvmCmd] = 0.0F;
    }
  }

  /* MATLAB Function: '<Root>/入座处理1' incorporates:
   *  Inport: '<Root>/ cushionThreshold1'
   *  Inport: '<Root>/backrestThreshold1'
   *  Inport: '<Root>/pointThreshold1'
   *  Inport: '<Root>/resetFlag1'
   *  MATLAB Function: '<Root>/矩阵处理1'
   */
  xtmp = airbag_13Hz_v2_U.pointThreshold1;
  if (rtIsInfF(airbag_13Hz_v2_U.pointThreshold1) || rtIsNaNF
      (airbag_13Hz_v2_U.pointThreshold1)) {
    xtmp = 20.0F;
  } else if (airbag_13Hz_v2_U.pointThreshold1 <= 0.0F) {
    xtmp = 20.0F;
  }

  if ((!airbag_13Hz_v2_DW.pState_not_empty) || airbag_13Hz_v2_U.resetFlag1) {
    airbag_13Hz_v2_DW.pState_i = 0;
    airbag_13Hz_v2_DW.pState_not_empty = true;
    airbag_13Hz_v2_DW.pOffCounter = 0;
    airbag_13Hz_v2_DW.pResetCounter = 0;
    airbag_13Hz_v2_DW.pBackrestLostCounter = 0;
  }

  memset(&backrestMatrix[0], 0, 56U * sizeof(real32_T));
  for (i = 0; i < 8; i++) {
    for (rtb_massageEnable = 0; rtb_massageEnable < 6; rtb_massageEnable++) {
      backrestMatrix[rtb_massageEnable + 7 * i] = airbag_13Hz_v2_Y.cushionData1
        [6 * i + rtb_massageEnable];
    }
  }

  airba_calculatePressureFeatures(backrestMatrix, xtmp, &avgPrev,
    &airbag_13Hz_v2_Y.cushionSum1);
  airba_calculatePressureFeatures(airbag_13Hz_v2_Y.backrestData1, xtmp, &avgPrev,
    &airbag_13Hz_v2_Y.backrestSum1);
  pState = airbag_13Hz_v2_DW.pState_i;
  rtb_reasonCode = 0;
  switch (airbag_13Hz_v2_DW.pState_i) {
   case 0:
    if (airbag_13Hz_v2_Y.cushionSum1 >= airbag_13Hz_v2_U.cushionThreshold1) {
      airbag_13Hz_v2_DW.pOffCounter = 0;
      airbag_13Hz_v2_DW.pResetCounter = 0;
      airbag_13Hz_v2_DW.pBackrestLostCounter = 0;
      if (airbag_13Hz_v2_Y.backrestSum1 >= airbag_13Hz_v2_U.backrestThreshold1)
      {
        pState = 2;
        rtb_reasonCode = 2;
      } else {
        pState = 1;
        rtb_reasonCode = 1;
      }
    }
    break;

   case 1:
    if ((airbag_13Hz_v2_Y.cushionSum1 >= airbag_13Hz_v2_U.cushionThreshold1) &&
        (airbag_13Hz_v2_Y.backrestSum1 >= airbag_13Hz_v2_U.backrestThreshold1))
    {
      pState = 2;
      airbag_13Hz_v2_DW.pOffCounter = 0;
      airbag_13Hz_v2_DW.pBackrestLostCounter = 0;
      rtb_reasonCode = 3;
    } else if (airbag_13Hz_v2_Y.cushionSum1 < airbag_13Hz_v2_U.cushionThreshold1)
    {
      if (airbag_13Hz_v2_DW.pOffCounter > 2147483646) {
        airbag_13Hz_v2_DW.pOffCounter = MAX_int32_T;
      } else {
        airbag_13Hz_v2_DW.pOffCounter++;
      }

      if (airbag_13Hz_v2_DW.pOffCounter >= 14) {
        pState = 3;
        airbag_13Hz_v2_DW.pOffCounter = 0;
        airbag_13Hz_v2_DW.pResetCounter = 0;
        rtb_reasonCode = 4;
      }
    } else {
      airbag_13Hz_v2_DW.pOffCounter = 0;
    }
    break;

   case 2:
    if (airbag_13Hz_v2_Y.backrestSum1 < airbag_13Hz_v2_U.backrestThreshold1) {
      if (airbag_13Hz_v2_DW.pBackrestLostCounter > 2147483646) {
        airbag_13Hz_v2_DW.pBackrestLostCounter = MAX_int32_T;
      } else {
        airbag_13Hz_v2_DW.pBackrestLostCounter++;
      }

      if (airbag_13Hz_v2_DW.pBackrestLostCounter >= 13) {
        pState = 1;
        airbag_13Hz_v2_DW.pBackrestLostCounter = 0;
        airbag_13Hz_v2_DW.pOffCounter = 0;
        rtb_reasonCode = 5;
      }
    } else {
      airbag_13Hz_v2_DW.pBackrestLostCounter = 0;
    }

    if (airbag_13Hz_v2_Y.cushionSum1 < airbag_13Hz_v2_U.cushionThreshold1) {
      if (airbag_13Hz_v2_DW.pOffCounter > 2147483646) {
        airbag_13Hz_v2_DW.pOffCounter = MAX_int32_T;
      } else {
        airbag_13Hz_v2_DW.pOffCounter++;
      }

      if (airbag_13Hz_v2_DW.pOffCounter >= 14) {
        pState = 3;
        airbag_13Hz_v2_DW.pOffCounter = 0;
        airbag_13Hz_v2_DW.pResetCounter = 0;
        rtb_reasonCode = 4;
      }
    } else {
      airbag_13Hz_v2_DW.pOffCounter = 0;
    }
    break;

   case 3:
    if (airbag_13Hz_v2_Y.cushionSum1 >= airbag_13Hz_v2_U.cushionThreshold1) {
      airbag_13Hz_v2_DW.pResetCounter = 0;
      airbag_13Hz_v2_DW.pOffCounter = 0;
      airbag_13Hz_v2_DW.pBackrestLostCounter = 0;
      if (airbag_13Hz_v2_Y.backrestSum1 >= airbag_13Hz_v2_U.backrestThreshold1)
      {
        pState = 2;
        rtb_reasonCode = 8;
      } else {
        pState = 1;
        rtb_reasonCode = 7;
      }
    } else if (airbag_13Hz_v2_DW.pResetCounter >= 130) {
      pState = 0;
      airbag_13Hz_v2_DW.pResetCounter = 0;
      rtb_reasonCode = 6;
    } else {
      airbag_13Hz_v2_DW.pResetCounter++;
    }
    break;
  }

  rtb_stateChanged = (airbag_13Hz_v2_DW.pState_i != pState);
  airbag_13Hz_v2_DW.pState_i = pState;
  rtb_isOccupied = ((airbag_13Hz_v2_DW.pState_i == 1) ||
                    (airbag_13Hz_v2_DW.pState_i == 2));

  /* MATLAB Function: '<Root>/活体检测1' incorporates:
   *  Inport: '<Root>/childCushionThresholdIn'
   *  Inport: '<Root>/detectorEnabled1'
   *  Inport: '<Root>/livingConfirmCountIn1'
   *  Inport: '<Root>/resetFlag1'
   *  Inport: '<Root>/sadNormalizeScaleIn1'
   *  Inport: '<Root>/sadThresholdIn1'
   *  MATLAB Function: '<Root>/矩阵处理1'
   */
  if (airbag_13Hz_v2_U.livingConfirmCountIn1 <= 0.0F) {
    nvmCmd = 3;
  } else {
    nvmCmd = (int32_T)fminf(3.0F, fmaxf(1.0F, rt_roundf_snf
      (airbag_13Hz_v2_U.livingConfirmCountIn1)));
  }

  if (airbag_13Hz_v2_U.childCushionThresholdIn <= 0.0F) {
    airbag_13Hz_v2_Y.childThreshold_out = 1400.0F;
  } else {
    airbag_13Hz_v2_Y.childThreshold_out =
      airbag_13Hz_v2_U.childCushionThresholdIn;
  }

  if ((!airbag_13Hz_v2_DW.frameCount_not_empty) || airbag_13Hz_v2_U.resetFlag1)
  {
    memcpy(&airbag_13Hz_v2_DW.prevCushion[0], &airbag_13Hz_v2_Y.cushionData1[0],
           48U * sizeof(real32_T));
    memcpy(&airbag_13Hz_v2_DW.prevBackrest[0], &airbag_13Hz_v2_Y.backrestData1[0],
           56U * sizeof(real32_T));
    for (i = 0; i < 13; i++) {
      airbag_13Hz_v2_DW.sadHistCushion[i] = 0.0F;
      airbag_13Hz_v2_DW.sadHistBackrest[i] = 0.0F;
    }

    airbag_13Hz_v2_DW.sadCount = 0.0;
    airbag_13Hz_v2_DW.frameCount = 0.0;
    airbag_13Hz_v2_DW.frameCount_not_empty = true;
    airbag_13Hz_v2_DW.livingQueue[0] = false;
    airbag_13Hz_v2_DW.livingQueue[1] = false;
    airbag_13Hz_v2_DW.livingQueue[2] = false;
    airbag_13Hz_v2_DW.livingQueueLen = 0.0;
    airbag_13Hz_v2_DW.latestRaw = false;
    airbag_13Hz_v2_DW.latestConfidence = 0.0F;
    airbag_13Hz_v2_DW.unlocked = false;
    memset(&airbag_13Hz_v2_DW.childSumHist[0], 0, 26U * sizeof(real32_T));
    airbag_13Hz_v2_DW.childSumCount = 0.0;
    airbag_13Hz_v2_DW.childClassLatch = 0;
    airbag_13Hz_v2_DW.childConfirmCnt = 0.0;
  }

  airbag_13Hz_v2_DW.frameCount++;
  memset(&backrestMatrix[0], 0, 56U * sizeof(real32_T));
  for (i = 0; i < 56; i++) {
    validMask[i] = false;
  }

  for (newWriteIndex = 0; newWriteIndex < 48; newWriteIndex++) {
    airbag_13Hz_v2_DW.prevCushion[newWriteIndex] =
      airbag_13Hz_v2_Y.cushionData1[newWriteIndex] -
      airbag_13Hz_v2_DW.prevCushion[newWriteIndex];
    cushionMatrix[newWriteIndex] = fabsf
      (airbag_13Hz_v2_DW.prevCushion[newWriteIndex]);
  }

  for (i = 0; i < 8; i++) {
    for (rtb_massageEnable = 0; rtb_massageEnable < 6; rtb_massageEnable++) {
      newWriteIndex = 7 * i + rtb_massageEnable;
      backrestMatrix[newWriteIndex] = cushionMatrix[6 * i + rtb_massageEnable];
      validMask[newWriteIndex] = true;
    }
  }

  validMask[0] = false;
  validMask[49] = false;
  for (newWriteIndex = 0; newWriteIndex < 56; newWriteIndex++) {
    airbag_13Hz_v2_DW.prevBackrest[newWriteIndex] =
      airbag_13Hz_v2_Y.backrestData1[newWriteIndex] -
      airbag_13Hz_v2_DW.prevBackrest[newWriteIndex];
    e[newWriteIndex] = fabsf(airbag_13Hz_v2_DW.prevBackrest[newWriteIndex]);
    b_validMask[newWriteIndex] = true;
  }

  for (i = 0; i < 4; i++) {
    newWriteIndex = 7 * f_0[i];
    b_validMask[newWriteIndex] = false;
    b_validMask[newWriteIndex + 1] = false;
  }

  b_validMask[2] = false;
  b_validMask[51] = false;
  memcpy(&airbag_13Hz_v2_DW.prevCushion[0], &airbag_13Hz_v2_Y.cushionData1[0],
         48U * sizeof(real32_T));
  memcpy(&airbag_13Hz_v2_DW.prevBackrest[0], &airbag_13Hz_v2_Y.backrestData1[0],
         56U * sizeof(real32_T));
  if (rtIsInf(airbag_13Hz_v2_DW.frameCount - 1.0)) {
    r = (rtNaN);
  } else {
    r = fmod(airbag_13Hz_v2_DW.frameCount - 1.0, 13.0);
    if (r == 0.0) {
      r = 0.0;
    }
  }

  newWriteIndex = 0;
  for (i = 0; i < 56; i++) {
    if (validMask[i]) {
      newWriteIndex++;
    }
  }

  rtb_massageEnable = newWriteIndex;
  newWriteIndex = 0;
  for (i = 0; i < 56; i++) {
    if (validMask[i]) {
      tmp_data[newWriteIndex] = (int8_T)i;
      newWriteIndex++;
    }
  }

  for (i = 0; i < rtb_massageEnable; i++) {
    backrestMatrix_data[i] = backrestMatrix[tmp_data[i]];
  }

  airbag_13Hz_v2_DW.sadHistCushion[(int32_T)(r + 1.0) - 1] = airbag_13Hz_v2_sum
    (backrestMatrix_data, &rtb_massageEnable) / 46.0F;
  newWriteIndex = 0;
  for (i = 0; i < 56; i++) {
    if (b_validMask[i]) {
      newWriteIndex++;
    }
  }

  rtb_massageEnable = newWriteIndex;
  newWriteIndex = 0;
  for (i = 0; i < 56; i++) {
    if (b_validMask[i]) {
      tmp_data_0[newWriteIndex] = (int8_T)i;
      newWriteIndex++;
    }
  }

  for (i = 0; i < rtb_massageEnable; i++) {
    backrestMatrix_data[i] = e[tmp_data_0[i]];
  }

  airbag_13Hz_v2_DW.sadHistBackrest[(int32_T)(r + 1.0) - 1] = airbag_13Hz_v2_sum
    (backrestMatrix_data, &rtb_massageEnable) / 46.0F;
  airbag_13Hz_v2_DW.sadCount = fmin(airbag_13Hz_v2_DW.sadCount + 1.0, 13.0);
  if (rtIsInf(airbag_13Hz_v2_DW.frameCount)) {
    r = (rtNaN);
  } else {
    r = fmod(airbag_13Hz_v2_DW.frameCount, 13.0);
    if (r == 0.0) {
      r = 0.0;
    }
  }

  isStill = ((r == 0.0) && (airbag_13Hz_v2_DW.sadCount >= 13.0));
  newWriteIndex = (int32_T)airbag_13Hz_v2_DW.sadCount;
  i = (int32_T)airbag_13Hz_v2_DW.sadCount;
  if (newWriteIndex - 1 >= 0) {
    memcpy(&tmp_data_1[0], &airbag_13Hz_v2_DW.sadHistCushion[0], (uint32_T)
           newWriteIndex * sizeof(real32_T));
  }

  airbag_13Hz_v2_Y.sadCushion1 = airbag_13Hz_v2_mean(tmp_data_1, &i);
  i = (int32_T)airbag_13Hz_v2_DW.sadCount;
  if (newWriteIndex - 1 >= 0) {
    memcpy(&tmp_data_1[0], &airbag_13Hz_v2_DW.sadHistBackrest[0], (uint32_T)
           newWriteIndex * sizeof(real32_T));
  }

  airbag_13Hz_v2_Y.sadBackrest1 = airbag_13Hz_v2_mean(tmp_data_1, &i);
  airbag_13Hz_v2_Y.sadEnergy1 = fmaxf(airbag_13Hz_v2_Y.sadCushion1,
    airbag_13Hz_v2_Y.sadBackrest1);
  if (airbag_13Hz_v2_U.sadNormalizeScaleIn1 <= 0.0F) {
    baseInflationSeconds = 2.0F;
  } else {
    baseInflationSeconds = airbag_13Hz_v2_U.sadNormalizeScaleIn1;
  }

  airbag_13Hz_v2_Y.sadScore1 = fminf(1.0F, airbag_13Hz_v2_Y.sadEnergy1 /
    baseInflationSeconds);
  if (isStill) {
    if (airbag_13Hz_v2_U.sadThresholdIn1 <= 0.0F) {
      baseInflationSeconds = 0.4F;
    } else {
      baseInflationSeconds = fminf(1.0F, airbag_13Hz_v2_U.sadThresholdIn1);
    }

    airbag_13Hz_v2_DW.latestRaw = (airbag_13Hz_v2_Y.sadScore1 >=
      baseInflationSeconds);

    /* Outport: '<Root>/confidence1' incorporates:
     *  Inport: '<Root>/sadThresholdIn1'
     */
    airbag_13Hz_v2_Y.confidence1 = airbag_13Hz_v2_Y.sadScore1;
    airbag_13Hz_v2_DW.latestConfidence = airbag_13Hz_v2_Y.sadScore1;
    if (rtb_isOccupied) {
      if (airbag_13Hz_v2_DW.livingQueueLen < 3.0) {
        airbag_13Hz_v2_DW.livingQueueLen++;
      }

      airbag_13Hz_v2_DW.livingQueue[0] = airbag_13Hz_v2_DW.livingQueue[1];
      airbag_13Hz_v2_DW.livingQueue[1] = airbag_13Hz_v2_DW.livingQueue[2];
      airbag_13Hz_v2_DW.livingQueue[2] = airbag_13Hz_v2_DW.latestRaw;
    }
  } else {
    /* Outport: '<Root>/confidence1' */
    airbag_13Hz_v2_Y.confidence1 = airbag_13Hz_v2_DW.latestConfidence;
  }

  if (airbag_13Hz_v2_DW.livingQueueLen < 3.0) {
    if ((3.0 - airbag_13Hz_v2_DW.livingQueueLen) + 1.0 > 3.0) {
      rtb_massageEnable = 0;
      newWriteIndex = 0;
    } else {
      rtb_massageEnable = (int32_T)((3.0 - airbag_13Hz_v2_DW.livingQueueLen) +
        1.0) - 1;
      newWriteIndex = 3;
    }

    newWriteIndex -= rtb_massageEnable;
    for (i = 0; i < newWriteIndex; i++) {
      queueValues_data[i] = airbag_13Hz_v2_DW.livingQueue[rtb_massageEnable + i];
    }
  } else {
    newWriteIndex = 3;
    queueValues_data[0] = airbag_13Hz_v2_DW.livingQueue[0];
    queueValues_data[1] = airbag_13Hz_v2_DW.livingQueue[1];
    queueValues_data[2] = airbag_13Hz_v2_DW.livingQueue[2];
  }

  if (!(airbag_13Hz_v2_U.detectorEnabled1 != 0.0F)) {
    pState = -1;
  } else if (!rtb_isOccupied) {
    pState = 0;
  } else if (newWriteIndex < 3) {
    pState = 1;
  } else {
    newWriteIndex = 3;
    queueValues_data_0[0] = queueValues_data[0];
    queueValues_data_0[1] = queueValues_data[1];
    queueValues_data_0[2] = queueValues_data[2];
    newWriteIndex = airbag_13_combineVectorElements(queueValues_data_0,
      &newWriteIndex);
    if ((real32_T)newWriteIndex >= nvmCmd) {
      pState = 3;
    } else if ((int32_T)(real32_T)newWriteIndex <= 3 - nvmCmd) {
      pState = 2;
    } else {
      pState = 1;
    }
  }

  switch (pState) {
   case 3:
    airbag_13Hz_v2_DW.unlocked = true;
    break;

   case 2:
    airbag_13Hz_v2_DW.unlocked = false;
    break;
  }

  r = airbag_13Hz_v2_DW.childConfirmCnt;

  /* Outport: '<Root>/isChild' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_v2_Y.isChild = 0.0F;

  /* Outport: '<Root>/isAdult' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_v2_Y.isAdult = 0.0F;

  /* MATLAB Function: '<Root>/活体检测1' */
  if (pState == 3) {
    xtmp = airbag_13Hz_v2_Y.cushionData1[0];
    for (newWriteIndex = 0; newWriteIndex < 47; newWriteIndex++) {
      xtmp += airbag_13Hz_v2_Y.cushionData1[newWriteIndex + 1];
    }

    xtmp *= 1.30434787F;
    if (airbag_13Hz_v2_DW.childSumCount > 0.0) {
      vlen_tmp = fmin(airbag_13Hz_v2_DW.childSumCount, 26.0);
      nvmCmd = (int32_T)vlen_tmp;
      avgPrev = airbag_13Hz_v2_DW.childSumHist[0];
      for (newWriteIndex = 2; newWriteIndex <= nvmCmd; newWriteIndex++) {
        avgPrev += airbag_13Hz_v2_DW.childSumHist[newWriteIndex - 1];
      }

      avgPrev /= (real32_T)vlen_tmp;
    } else {
      avgPrev = xtmp;
    }

    if ((!(airbag_13Hz_v2_DW.childSumCount > 0.0)) || (!(xtmp < avgPrev * 0.7F)))
    {
      airbag_13Hz_v2_DW.childSumCount = fmin(airbag_13Hz_v2_DW.childSumCount +
        1.0, 26.0);
      if (rtIsInf(airbag_13Hz_v2_DW.childSumCount - 1.0)) {
        r = (rtNaN);
      } else {
        r = airbag_13Hz_v2_DW.childSumCount - 1.0;
        if (airbag_13Hz_v2_DW.childSumCount - 1.0 == 0.0) {
          r = 0.0;
        }
      }

      if (airbag_13Hz_v2_DW.childSumCount >= 26.0) {
        for (i = 0; i < 25; i++) {
          airbag_13Hz_v2_DW.childSumHist[i] = airbag_13Hz_v2_DW.childSumHist[i +
            1];
        }

        airbag_13Hz_v2_DW.childSumHist[25] = xtmp;
        xtmp = airbag_13Hz_v2_DW.childSumHist[0];
        for (nvmCmd = 0; nvmCmd < 25; nvmCmd++) {
          xtmp += airbag_13Hz_v2_DW.childSumHist[nvmCmd + 1];
        }

        xtmp /= 26.0F;
      } else {
        airbag_13Hz_v2_DW.childSumHist[(int32_T)(r + 1.0) - 1] = xtmp;
        newWriteIndex = (int32_T)airbag_13Hz_v2_DW.childSumCount;
        if (newWriteIndex - 1 >= 0) {
          memcpy(&d_x_data[0], &airbag_13Hz_v2_DW.childSumHist[0], (uint32_T)
                 newWriteIndex * sizeof(real32_T));
        }

        avgPrev = airbag_13Hz_v2_DW.childSumHist[0];
        for (nvmCmd = 2; nvmCmd <= newWriteIndex; nvmCmd++) {
          avgPrev += d_x_data[nvmCmd - 1];
        }

        xtmp = avgPrev / (real32_T)airbag_13Hz_v2_DW.childSumCount;
      }

      if (xtmp <= airbag_13Hz_v2_Y.childThreshold_out) {
        candidate = 2;
      } else {
        candidate = 1;
      }

      if (airbag_13Hz_v2_DW.childClassLatch == 0) {
        r = airbag_13Hz_v2_DW.childConfirmCnt + 1.0;
        if (airbag_13Hz_v2_DW.childConfirmCnt + 1.0 >= 26.0) {
          airbag_13Hz_v2_DW.childClassLatch = candidate;
          r = 0.0;
        }
      } else if (candidate != airbag_13Hz_v2_DW.childClassLatch) {
        r = airbag_13Hz_v2_DW.childConfirmCnt + 1.0;
        if (airbag_13Hz_v2_DW.childConfirmCnt + 1.0 >= 26.0) {
          airbag_13Hz_v2_DW.childClassLatch = candidate;
          r = 0.0;
        }
      } else {
        r = 0.0;
      }
    }

    switch (airbag_13Hz_v2_DW.childClassLatch) {
     case 2:
      /* Outport: '<Root>/isChild' */
      airbag_13Hz_v2_Y.isChild = 1.0F;
      break;

     case 1:
      /* Outport: '<Root>/isAdult' */
      airbag_13Hz_v2_Y.isAdult = 1.0F;
      break;
    }
  } else {
    memset(&airbag_13Hz_v2_DW.childSumHist[0], 0, 26U * sizeof(real32_T));
    airbag_13Hz_v2_DW.childSumCount = 0.0;
    airbag_13Hz_v2_DW.childClassLatch = 0;
    r = 0.0;
  }

  airbag_13Hz_v2_DW.childConfirmCnt = r;

  /* MATLAB Function: '<Root>/久坐按摩1' incorporates:
   *  Inport: '<Root>/manualMassageOn1'
   *  Inport: '<Root>/sitThresholdmin1'
   */
  if (!airbag_13Hz_v2_DW.phase_not_empty) {
    airbag_13Hz_v2_DW.phase = 0U;
    airbag_13Hz_v2_DW.phase_not_empty = true;
  }

  manualNow = (airbag_13Hz_v2_U.manualMassageOn1 >= 0.5F);
  xtmp = airbag_13Hz_v2_U.sitThresholdmin1;
  if (rtIsInfF(airbag_13Hz_v2_U.sitThresholdmin1) || rtIsNaNF
      (airbag_13Hz_v2_U.sitThresholdmin1)) {
    xtmp = 5.0F;
  } else if (airbag_13Hz_v2_U.sitThresholdmin1 <= 0.0F) {
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
  airbag_13Hz_v2_Y.longSitMinutes1 = 0.0F;

  /* Outport: '<Root>/longSitMassageActive1' incorporates:
   *  MATLAB Function: '<Root>/久坐按摩1'
   */
  airbag_13Hz_v2_Y.longSitMassageActive1 = 0.0F;

  /* Outport: '<Root>/longSitCycleRemain1' incorporates:
   *  MATLAB Function: '<Root>/久坐按摩1'
   */
  airbag_13Hz_v2_Y.longSitCycleRemain1 = 0.0F;

  /* Outport: '<Root>/longSitPrompt1' incorporates:
   *  MATLAB Function: '<Root>/久坐按摩1'
   */
  airbag_13Hz_v2_Y.longSitPrompt1 = 0.0F;

  /* MATLAB Function: '<Root>/久坐按摩1' incorporates:
   *  Inport: '<Root>/longSitMassageStop1'
   *  Inport: '<Root>/resetFlag1'
   *  MATLAB Function: '<Root>/健康干预控制1'
   *  MATLAB Function: '<Root>/健康检测1'
   *  MATLAB Function: '<Root>/入座处理1'
   *  MATLAB Function: '<Root>/活体检测1'
   */
  if (rtb_isOccupied && (!airbag_13Hz_v2_DW.prevOccupied)) {
    airbag_13Hz_v2_DW.phase = 0U;
    airbag_13Hz_v2_DW.sitFrameCount = 0U;
    airbag_13Hz_v2_DW.massageFrameCount = 0U;
    airbag_13Hz_v2_DW.livingLatched = false;
  }

  airbag_13Hz_v2_DW.livingLatched = ((rtb_isOccupied && (pState == 3)) ||
    airbag_13Hz_v2_DW.livingLatched);
  newReason = !rtb_isOccupied;
  if (airbag_13Hz_v2_U.resetFlag1 || (airbag_13Hz_v2_DW.pState_i == 3) ||
      newReason) {
    if (airbag_13Hz_v2_DW.phase == 1) {
      for (i = 0; i < 14; i++) {
        rtb_massageGears[i] = 4;
      }
    }

    airbag_13Hz_v2_DW.phase = 0U;
    airbag_13Hz_v2_DW.sitFrameCount = 0U;
    airbag_13Hz_v2_DW.massageFrameCount = 0U;
    airbag_13Hz_v2_DW.livingLatched = false;
    airbag_13Hz_v2_DW.prevOccupied = rtb_isOccupied;
    airbag_13Hz_v2_DW.prevManualCmd = manualNow;
  } else if (!(airbag_13Hz_v2_U.longSitMassageStop1 < 1.0F)) {
    if (airbag_13Hz_v2_DW.phase == 1) {
      for (i = 0; i < 14; i++) {
        rtb_massageGears[i] = 4;
      }
    }

    airbag_13Hz_v2_DW.phase = 0U;
    airbag_13Hz_v2_DW.sitFrameCount = 0U;
    airbag_13Hz_v2_DW.massageFrameCount = 0U;
    airbag_13Hz_v2_DW.prevOccupied = true;
    airbag_13Hz_v2_DW.prevManualCmd = manualNow;
  } else if (manualNow && (!airbag_13Hz_v2_DW.prevManualCmd) &&
             (airbag_13Hz_v2_DW.phase != 1)) {
    airbag_13Hz_v2_DW.phase = 1U;
    airbag_13Hz_v2_DW.massageFrameCount = 0U;
    rtb_massageEnable = 1;
    for (i = 0; i < 14; i++) {
      rtb_massageGears[i] = 3;
    }

    /* Outport: '<Root>/longSitMassageActive1' */
    airbag_13Hz_v2_Y.longSitMassageActive1 = 1.0F;

    /* Outport: '<Root>/longSitMinutes1' */
    airbag_13Hz_v2_Y.longSitMinutes1 = (real32_T)airbag_13Hz_v2_DW.sitFrameCount
      * 0.0769230798F / 60.0F;
    airbag_13Hz_v2_DW.prevOccupied = true;
    airbag_13Hz_v2_DW.prevManualCmd = true;
  } else if ((!airbag_13Hz_v2_DW.livingLatched) && (airbag_13Hz_v2_DW.phase != 1))
  {
    airbag_13Hz_v2_DW.phase = 0U;
    airbag_13Hz_v2_DW.sitFrameCount = 0U;
    airbag_13Hz_v2_DW.massageFrameCount = 0U;
    airbag_13Hz_v2_DW.prevOccupied = true;
    airbag_13Hz_v2_DW.prevManualCmd = manualNow;
  } else {
    if (airbag_13Hz_v2_DW.phase == 0) {
      if (airbag_13Hz_v2_DW.sitFrameCount < sitThresholdFrames) {
        airbag_13Hz_v2_DW.sitFrameCount++;
      }

      if (airbag_13Hz_v2_DW.sitFrameCount >= sitThresholdFrames) {
        airbag_13Hz_v2_DW.phase = 1U;
        airbag_13Hz_v2_DW.massageFrameCount = 0U;
        rtb_massageEnable = 1;
        for (i = 0; i < 14; i++) {
          rtb_massageGears[i] = 3;
        }

        /* Outport: '<Root>/longSitMassageActive1' */
        airbag_13Hz_v2_Y.longSitMassageActive1 = 1.0F;

        /* Outport: '<Root>/longSitPrompt1' */
        airbag_13Hz_v2_Y.longSitPrompt1 = 1.0F;

        /* Outport: '<Root>/longSitMinutes1' */
        airbag_13Hz_v2_Y.longSitMinutes1 = xtmp;
      } else {
        /* Outport: '<Root>/longSitMinutes1' */
        airbag_13Hz_v2_Y.longSitMinutes1 = (real32_T)
          airbag_13Hz_v2_DW.sitFrameCount * 0.0769230798F / 60.0F;
        qY = sitThresholdFrames -
          /*MW:operator MISRA2012:D4.1 CERT-C:INT30-C 'Justifying MISRA C rule violation'*/
          /*MW:OvSatOk*/ airbag_13Hz_v2_DW.sitFrameCount;
        if (qY > sitThresholdFrames) {
          qY = 0U;
        }

        /* Outport: '<Root>/longSitCycleRemain1' */
        airbag_13Hz_v2_Y.longSitCycleRemain1 = (real32_T)qY;
      }
    } else {
      rtb_massageEnable = 1;
      for (i = 0; i < 14; i++) {
        rtb_massageGears[i] = 3;
      }

      /* Outport: '<Root>/longSitMassageActive1' */
      airbag_13Hz_v2_Y.longSitMassageActive1 = 1.0F;

      /* Outport: '<Root>/longSitMinutes1' */
      airbag_13Hz_v2_Y.longSitMinutes1 = xtmp;
      if (airbag_13Hz_v2_DW.massageFrameCount < 11700U) {
        airbag_13Hz_v2_DW.massageFrameCount++;
      }

      if (airbag_13Hz_v2_DW.massageFrameCount >= 11700U) {
        rtb_massageEnable = 0;
        for (i = 0; i < 14; i++) {
          rtb_massageGears[i] = 4;
        }

        /* Outport: '<Root>/longSitMassageActive1' */
        airbag_13Hz_v2_Y.longSitMassageActive1 = 0.0F;
        airbag_13Hz_v2_DW.phase = 0U;
        airbag_13Hz_v2_DW.sitFrameCount = 0U;
        airbag_13Hz_v2_DW.massageFrameCount = 0U;

        /* Outport: '<Root>/longSitMinutes1' */
        airbag_13Hz_v2_Y.longSitMinutes1 = 0.0F;

        /* Outport: '<Root>/longSitCycleRemain1' */
        airbag_13Hz_v2_Y.longSitCycleRemain1 = (real32_T)sitThresholdFrames;
      }
    }

    airbag_13Hz_v2_DW.prevOccupied = true;
    airbag_13Hz_v2_DW.prevManualCmd = manualNow;
  }

  /* MATLAB Function: '<Root>/品味系数1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion18'
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
  xtmp = rt_roundf_snf(airbag_13Hz_v2_U.frontCmd1[0]);
  avgPrev = rt_roundf_snf(airbag_13Hz_v2_U.frontCmd1[1]);
  adjustCmd = airbag_13Hz_v2_directionOf(airbag_13Hz_v2_U.frontCmd1[2]);
  baseInflationSeconds = airbag_13Hz_v2_U.inflation_time2;
  if (rtIsInfF(airbag_13Hz_v2_U.inflation_time2) || rtIsNaNF
      (airbag_13Hz_v2_U.inflation_time2)) {
    baseInflationSeconds = 2.0F;
  } else if (airbag_13Hz_v2_U.inflation_time2 < 0.0F) {
    baseInflationSeconds = 2.0F;
  }

  deflationSeconds = airbag_13Hz_v2_U.deflation_time1;
  if (rtIsInfF(airbag_13Hz_v2_U.deflation_time1) || rtIsNaNF
      (airbag_13Hz_v2_U.deflation_time1)) {
    deflationSeconds = 2.0F;
  } else if (airbag_13Hz_v2_U.deflation_time1 < 0.0F) {
    deflationSeconds = 2.0F;
  }

  adoptionFrequency = airbag_13Hz_v2_U.adoption_frequency1;
  if (rtIsInfF(airbag_13Hz_v2_U.adoption_frequency1) || rtIsNaNF
      (airbag_13Hz_v2_U.adoption_frequency1)) {
    adoptionFrequency = 1.0F;
  } else if (airbag_13Hz_v2_U.adoption_frequency1 <= 0.0F) {
    adoptionFrequency = 1.0F;
  }

  adoptionFrequency = fmaxf(1.0F, adoptionFrequency);
  manualNow = ((real32_T)rtb_isOccupied > 0.5F);
  living = ((real32_T)airbag_13Hz_v2_DW.unlocked > 0.5F);
  if (!manualNow) {
    airbag_13Hz_v2_DW.pSeatHandled = 0.0F;
    airbag_13Hz_v2_DW.pReplayIndex = 0;
    airbag_13Hz_v2_DW.pPending[0] = 0.0F;
    airbag_13Hz_v2_DW.pPending[1] = 0.0F;
    airbag_13Hz_v2_DW.pPending[2] = 0.0F;
    for (i = 0; i < 5; i++) {
      airbag_13Hz_v2_DW.pRequest[i] = 0.0F;
      airbag_13Hz_v2_DW.pEditTimes[i] = airbag_13Hz_v2_DW.pSavedTimes[i];
    }

    airbag_13Hz_v2_DW.pBaseElapsed = 0.0F;
    airbag_13Hz_v2_DW.pBaseReady = 0.0F;
    airbag_13Hz_v2_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_v2_DW.pGapCycles = 0;
    airbag_13Hz_v2_DW.pEntryDeflate = 0.0F;
    if (airbag_13Hz_v2_DW.pAdaptiveOff > 0.5F) {
      airbag_13Hz_v2_DW.pState = 3.0F;
    } else {
      airbag_13Hz_v2_DW.pState = (real32_T)(airbag_13Hz_v2_DW.pValid > 0.5F);
    }
  }

  tmp_0 = ((rtb_reasonCode == 1) || (rtb_reasonCode == 2) || (rtb_reasonCode ==
            7) || (rtb_reasonCode == 8));
  if ((manualNow && (airbag_13Hz_v2_DW.pPrevOccupied <= 0.5F)) ||
      ((rtb_reasonCode != airbag_13Hz_v2_DW.pPrevReasonCode_j) && tmp_0)) {
    airbag_13Hz_v2_DW.pBaseElapsed = 0.0F;
    airbag_13Hz_v2_DW.pBaseReady = 0.0F;
    airbag_13Hz_v2_DW.pSeatHandled = 0.0F;
  }

  if (manualNow && (airbag_13Hz_v2_DW.pBaseReady <= 0.5F)) {
    if (living) {
      airbag_13Hz_v2_DW.pBaseElapsed++;
      if (airbag_13Hz_v2_DW.pBaseElapsed >= baseInflationSeconds *
          adoptionFrequency) {
        airbag_13Hz_v2_DW.pBaseReady = 1.0F;
        airbag_13Hz_v2_DW.pBaseElapsed = 0.0F;
      }
    } else {
      airbag_13Hz_v2_DW.pBaseElapsed = 0.0F;
    }
  }

  living = (manualNow && living && (airbag_13Hz_v2_DW.pBaseReady > 0.5F) &&
            (!(rtb_massageEnable > 0.5F)));
  if ((airbag_13Hz_v2_DW.UnitDelay2_DSTATE[0] > 0.5F) &&
      (airbag_13Hz_v2_DW.pPrevNvmValid <= 0.5F)) {
    for (newWriteIndex = 0; newWriteIndex < 5; newWriteIndex++) {
      baseInflationSeconds = airbag_13Hz_v2_DW.UnitDelay2_DSTATE[newWriteIndex +
        1];
      if (rtIsInfF(baseInflationSeconds) || rtIsNaNF(baseInflationSeconds)) {
        baseInflationSeconds = 0.0F;
        airbag_13Hz_v2_DW.pSavedTimes[newWriteIndex] = 0.0F;
      } else {
        candidate = d_0[newWriteIndex];
        baseInflationSeconds = fmaxf(-(real32_T)candidate, fminf(candidate,
          baseInflationSeconds));
        airbag_13Hz_v2_DW.pSavedTimes[newWriteIndex] = baseInflationSeconds;
      }

      airbag_13Hz_v2_DW.pEditTimes[newWriteIndex] = baseInflationSeconds;
    }

    gapActive = airbag_13Hz_v_allFinitePositive
      (&airbag_13Hz_v2_DW.UnitDelay2_DSTATE[6]);
    for (i = 0; i < 8; i++) {
      if (gapActive) {
        airbag_13Hz_v2_DW.pThresholds[i] = airbag_13Hz_v2_DW.UnitDelay2_DSTATE[i
          + 6];
      } else {
        airbag_13Hz_v2_DW.pThresholds[i] = e_1[i];
      }
    }

    airbag_13Hz_v2_DW.pAdaptiveOff = (real32_T)
      (airbag_13Hz_v2_DW.UnitDelay2_DSTATE[14] > 0.5F);
    airbag_13Hz_v2_DW.pValid = 1.0F;
    if (airbag_13Hz_v2_DW.pAdaptiveOff > 0.5F) {
      airbag_13Hz_v2_DW.pState = 3.0F;
    } else {
      airbag_13Hz_v2_DW.pState = 1.0F;
    }

    airbag_13Hz_v2_DW.pSeatHandled = 0.0F;
    airbag_13Hz_v2_DW.pReplayIndex = 0;
    airbag_13Hz_v2_DW.pPending[0] = 0.0F;
    airbag_13Hz_v2_DW.pPending[1] = 0.0F;
    airbag_13Hz_v2_DW.pPending[2] = 0.0F;
  }

  if ((airbag_13Hz_v2_DW.pRequest[0] > 0.5F) && living) {
    airbag_13Hz_v2_DW.pRequestElapsed++;
    if (airbag_13Hz_v2_DW.pRequestElapsed >= fmaxf(1.0F, fabsf
         (airbag_13Hz_v2_DW.pRequest[3]) * adoptionFrequency)) {
      for (i = 0; i < 5; i++) {
        airbag_13Hz_v2_DW.pRequest[i] = 0.0F;
      }

      airbag_13Hz_v2_DW.pRequestElapsed = 0.0F;
      airbag_13Hz_v2_DW.pGapCycles = 1;
    }
  }

  if (living && (airbag_13Hz_v2_DW.pSeatHandled <= 0.5F)) {
    airbag_13Hz_v2_DW.pSeatHandled = 1.0F;
    if (airbag_13Hz_v2_DW.pValid > 0.5F) {
      if (airbag_13Hz_v2_DW.pAdaptiveOff > 0.5F) {
        airbag_13Hz_v2_DW.pState = 3.0F;
      } else {
        airbag_13Hz_v2_DW.pState = 1.0F;
      }

      for (i = 0; i < 5; i++) {
        airbag_13Hz_v2_DW.pEditTimes[i] = airbag_13Hz_v2_DW.pSavedTimes[i];
      }

      airbag_13Hz_v2_DW.pReplayIndex = 1;
    } else if (airbag_13Hz_v2_DW.pAdaptiveOff > 0.5F) {
      airbag_13Hz_v2_DW.pState = 3.0F;
    }
  }

  if ((xtmp != 0.0F) && (xtmp != airbag_13Hz_v2_DW.pPrevFrontCmd[0])) {
    if (xtmp == 1.0F) {
      airbag_13Hz_v2_DW.pState = 1.0F;
      airbag_13Hz_v2_DW.pPending[1] = 0.0F;
      airbag_13Hz_v2_DW.pEntryDeflate = 1.0F;
      airbag_13Hz_v2_DW.pReplayIndex = 0;
      for (i = 0; i < 5; i++) {
        airbag_13Hz_v2_DW.pEditTimes[i] = 0.0F;
      }

      if (airbag_13Hz_v2_DW.pAdaptiveOff > 0.5F) {
        airbag_13Hz_v2_DW.pAdaptiveOff = 0.0F;
        nvmCmd = 3;
      }
    } else if (xtmp == 2.0F) {
      if (airbag_13Hz_v2_DW.pState == 1.0F) {
        airbag_13Hz_v2_DW.pPending[0] = 1.0F;
      }
    } else if (xtmp == 3.0F) {
      airbag_13Hz_v2_DW.pPending[1] = 1.0F;
      airbag_13Hz_v2_DW.pEntryDeflate = 0.0F;
      if (airbag_13Hz_v2_DW.pAdaptiveOff > 0.5F) {
        airbag_13Hz_v2_DW.pAdaptiveOff = 0.0F;
        nvmCmd = 3;
      }
    } else if (xtmp == 4.0F) {
      airbag_13Hz_v2_DW.pState = 0.0F;
      airbag_13Hz_v2_DW.pValid = 0.0F;
      for (i = 0; i < 5; i++) {
        airbag_13Hz_v2_DW.pSavedTimes[i] = 0.0F;
        airbag_13Hz_v2_DW.pEditTimes[i] = 0.0F;
      }

      for (i = 0; i < 8; i++) {
        airbag_13Hz_v2_DW.pThresholds[i] = e_1[i];
      }

      airbag_13Hz_v2_DW.pReplayIndex = 0;
      airbag_13Hz_v2_DW.pSeatHandled = 1.0F;
      airbag_13Hz_v2_DW.pPending[0] = 0.0F;
      airbag_13Hz_v2_DW.pPending[1] = 0.0F;
      airbag_13Hz_v2_DW.pPending[2] = 1.0F;
      airbag_13Hz_v2_DW.pAdaptiveOff = 0.0F;
      airbag_13Hz_v2_DW.pEntryDeflate = 0.0F;
      nvmCmd = 2;
    } else if (xtmp == 5.0F) {
      airbag_13Hz_v2_DW.pState = 3.0F;
      airbag_13Hz_v2_DW.pPending[1] = 0.0F;
      airbag_13Hz_v2_DW.pEntryDeflate = 0.0F;
      if (airbag_13Hz_v2_DW.pAdaptiveOff <= 0.5F) {
        airbag_13Hz_v2_DW.pAdaptiveOff = 1.0F;
        nvmCmd = 3;
      }
    }
  }

  gapActive = (airbag_13Hz_v2_DW.pGapCycles > 0);
  if (gapActive && (airbag_13Hz_v2_DW.pGapCycles >= -2147483647)) {
    airbag_13Hz_v2_DW.pGapCycles--;
  }

  b_requestIdle_tmp = !gapActive;
  requestIdle = ((airbag_13Hz_v2_DW.pRequest[0] <= 0.5F) && b_requestIdle_tmp);
  if ((airbag_13Hz_v2_DW.pPending[2] > 0.5F) && (requestIdle && living)) {
    airbag_13Hz_v2_DW.pRequest[0] = 1.0F;
    airbag_13Hz_v2_DW.pRequest[1] = 0.0F;
    airbag_13Hz_v2_DW.pRequest[2] = -1.0F;
    airbag_13Hz_v2_DW.pRequest[3] = deflationSeconds;
    airbag_13Hz_v2_DW.pRequest[4] = 3.0F;
    airbag_13Hz_v2_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_v2_DW.pPending[2] = 0.0F;
    requestIdle = false;
  }

  if ((airbag_13Hz_v2_DW.pEntryDeflate > 0.5F) && requestIdle && living &&
      (airbag_13Hz_v2_DW.pPending[2] <= 0.5F)) {
    for (i = 0; i < 5; i++) {
      airbag_13Hz_v2_DW.pRequest[i] = g[i];
    }

    airbag_13Hz_v2_DW.pRequestElapsed = 0.0F;
    airbag_13Hz_v2_DW.pEntryDeflate = 0.0F;
    requestIdle = false;
  }

  if ((adjustCmd != 0.0F) && ((adjustCmd != airbag_13Hz_v2_DW.pPrevFrontCmd[2]) ||
       (avgPrev != airbag_13Hz_v2_DW.pPrevFrontCmd[1])) && requestIdle &&
      (airbag_13Hz_v2_DW.pReplayIndex == 0) && (airbag_13Hz_v2_DW.pState == 1.0F)
      && living && (airbag_13Hz_v2_DW.pEntryDeflate <= 0.5F)) {
    queueValues_data[0] = (airbag_13Hz_v2_DW.pPending[0] > 0.5F);
    queueValues_data[1] = (airbag_13Hz_v2_DW.pPending[1] > 0.5F);
    queueValues_data[2] = (airbag_13Hz_v2_DW.pPending[2] > 0.5F);
    if (!airbag_13Hz_v2_any(queueValues_data)) {
      if (avgPrev < 2.14748365E+9F) {
        if (avgPrev >= -2.14748365E+9F) {
          i = (int32_T)avgPrev;
        } else {
          i = MIN_int32_T;
        }
      } else {
        i = MAX_int32_T;
      }

      if ((i >= 1) && (i <= 5)) {
        baseInflationSeconds = airbag_13Hz_v2_DW.pEditTimes[i - 1];
        deflationSeconds = h[i - 1];
        adoptionFrequency = deflationSeconds * adjustCmd + baseInflationSeconds;
        if (rtIsInfF(adoptionFrequency) || rtIsNaNF(adoptionFrequency)) {
          adoptionFrequency = 0.0F;
        } else {
          rtb_backrest_cop_y = d_0[i - 1];
          adoptionFrequency = fmaxf(-rtb_backrest_cop_y, fminf
            (rtb_backrest_cop_y, adoptionFrequency));
        }

        if (baseInflationSeconds != adoptionFrequency) {
          airbag_13Hz_v2_DW.pEditTimes[i - 1] = adoptionFrequency;
          airbag_13Hz_v2_DW.pRequest[0] = 1.0F;
          airbag_13Hz_v2_DW.pRequest[1] = (real32_T)i;
          airbag_13Hz_v2_DW.pRequest[2] = adjustCmd;
          airbag_13Hz_v2_DW.pRequest[3] = deflationSeconds;
          airbag_13Hz_v2_DW.pRequest[4] = 1.0F;
          airbag_13Hz_v2_DW.pRequestElapsed = 0.0F;
          requestIdle = false;
        }
      }
    }
  }

  if ((airbag_13Hz_v2_DW.pReplayIndex > 0) && living && requestIdle &&
      (airbag_13Hz_v2_DW.pPending[2] <= 0.5F) &&
      (airbag_13Hz_v2_DW.pEntryDeflate <= 0.5F)) {
    newWriteIndex = 0;
    exitg1 = false;
    while ((!exitg1) && (newWriteIndex < 5)) {
      if (airbag_13Hz_v2_DW.pReplayIndex <= 5) {
        idx = airbag_13Hz_v2_DW.pReplayIndex;
        deflationSeconds =
          airbag_13Hz_v2_DW.pSavedTimes[airbag_13Hz_v2_DW.pReplayIndex - 1];
        airbag_13Hz_v2_DW.pReplayIndex++;
        baseInflationSeconds = fabsf(deflationSeconds);
        if (baseInflationSeconds > 0.01F) {
          airbag_13Hz_v2_DW.pRequest[0] = 1.0F;
          airbag_13Hz_v2_DW.pRequest[1] = (real32_T)idx;
          airbag_13Hz_v2_DW.pRequest[2] = airbag_13Hz_v2_directionOf
            (deflationSeconds);
          airbag_13Hz_v2_DW.pRequest[3] = baseInflationSeconds;
          airbag_13Hz_v2_DW.pRequest[4] = 2.0F;
          airbag_13Hz_v2_DW.pRequestElapsed = 0.0F;
          exitg1 = true;
        } else {
          newWriteIndex++;
        }
      } else {
        newWriteIndex++;
      }
    }
  }

  if ((airbag_13Hz_v2_DW.pReplayIndex > 5) && (airbag_13Hz_v2_DW.pRequest[0] <=
       0.5F) && b_requestIdle_tmp) {
    airbag_13Hz_v2_DW.pReplayIndex = 0;
  }

  if ((airbag_13Hz_v2_DW.pRequest[0] <= 0.5F) &&
      ((airbag_13Hz_v2_DW.pReplayIndex == 0) && ((airbag_13Hz_v2_DW.pPending[2] <=
         0.5F) && ((airbag_13Hz_v2_DW.pEntryDeflate <= 0.5F) &&
                   b_requestIdle_tmp)))) {
    if ((airbag_13Hz_v2_DW.pPending[0] > 0.5F) && living) {
      for (i = 0; i < 5; i++) {
        airbag_13Hz_v2_DW.pSavedTimes[i] = airbag_13Hz_v2_DW.pEditTimes[i];
      }

      airbag_13Hz_v2_makeThresholds(airbag_13Hz_v2_DW.UnitDelay3_DSTATE[0],
        airbag_13Hz_v2_DW.UnitDelay3_DSTATE[1],
        airbag_13Hz_v2_DW.UnitDelay3_DSTATE[2],
        airbag_13Hz_v2_DW.UnitDelay3_DSTATE[3], airbag_13Hz_v2_DW.pThresholds);
      airbag_13Hz_v2_DW.pValid = 1.0F;
      airbag_13Hz_v2_DW.pState = 1.0F;
      airbag_13Hz_v2_DW.pPending[0] = 0.0F;
      nvmCmd = 1;
    }

    if ((airbag_13Hz_v2_DW.pPending[1] > 0.5F) && (airbag_13Hz_v2_DW.pPending[0]
         <= 0.5F)) {
      airbag_13Hz_v2_DW.pState = 2.0F;
      airbag_13Hz_v2_DW.pPending[1] = 0.0F;
    }
  }

  if (airbag_13Hz_v2_DW.pRequest[0] > 0.5F) {
    gapActive = true;
  } else if (airbag_13Hz_v2_DW.pReplayIndex > 0) {
    gapActive = true;
  } else {
    queueValues_data[0] = (airbag_13Hz_v2_DW.pPending[0] > 0.5F);
    queueValues_data[1] = (airbag_13Hz_v2_DW.pPending[1] > 0.5F);
    queueValues_data[2] = (airbag_13Hz_v2_DW.pPending[2] > 0.5F);
    gapActive = (airbag_13Hz_v2_any(queueValues_data) ||
                 ((airbag_13Hz_v2_DW.pEntryDeflate > 0.5F) || gapActive));
  }

  b_requestIdle_tmp = (((airbag_13Hz_v2_DW.pState == 0.0F) ||
                        (airbag_13Hz_v2_DW.pState == 2.0F)) && living &&
                       ((real32_T)gapActive <= 0.5F));
  deflationSeconds = airbag_13Hz_v2_DW.pRequest[1];
  rtb_status[1] = airbag_13Hz_v2_DW.pValid;
  rtb_status[2] = b_requestIdle_tmp;
  rtb_status[3] = gapActive;
  rtb_nvmWrite[0] = (real32_T)nvmCmd;
  for (i = 0; i < 5; i++) {
    rtb_status[i + 4] = airbag_13Hz_v2_DW.pEditTimes[i];
    rtb_nvmWrite[i + 1] = airbag_13Hz_v2_DW.pSavedTimes[i];
  }

  for (i = 0; i < 8; i++) {
    rtb_nvmWrite[i + 6] = airbag_13Hz_v2_DW.pThresholds[i];
  }

  rtb_nvmWrite[14] = airbag_13Hz_v2_DW.pAdaptiveOff;
  airbag_13Hz_v2_DW.pPrevFrontCmd[0] = xtmp;
  airbag_13Hz_v2_DW.pPrevFrontCmd[1] = avgPrev;
  airbag_13Hz_v2_DW.pPrevFrontCmd[2] = adjustCmd;
  airbag_13Hz_v2_DW.pPrevNvmValid = airbag_13Hz_v2_DW.UnitDelay2_DSTATE[0];
  airbag_13Hz_v2_DW.pPrevReasonCode_j = rtb_reasonCode;
  airbag_13Hz_v2_DW.pPrevOccupied = manualNow;

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
    airbag_13Hz_v2_Y.ratioInflate_out1 = airbag_13Hz_v2_DW.pThresholds[0];
    airbag_13Hz_v2_Y.ratioDeflate_out1 = airbag_13Hz_v2_DW.pThresholds[1];
    airbag_13Hz_v2_Y.ratioInflateLeft_out1 = airbag_13Hz_v2_DW.pThresholds[2];
    airbag_13Hz_v2_Y.ratioDeflateLeft_out1 = airbag_13Hz_v2_DW.pThresholds[3];
    airbag_13Hz_v2_Y.leftInflateThreshold_out1 = airbag_13Hz_v2_DW.pThresholds[4];
    airbag_13Hz_v2_Y.leftDeflateThreshold_out1 = airbag_13Hz_v2_DW.pThresholds[5];
    airbag_13Hz_v2_Y.rightInflateThreshold_out1 = airbag_13Hz_v2_DW.pThresholds
      [6];
    airbag_13Hz_v2_Y.rightDeflateThreshold_out1 = airbag_13Hz_v2_DW.pThresholds
      [7];
  } else {
    airbag_13Hz_v2_Y.ratioInflate_out1 = airbag_13Hz_v2_U.ratioInflate1;
    airbag_13Hz_v2_Y.ratioDeflate_out1 = airbag_13Hz_v2_U.ratioDeflate1;
    airbag_13Hz_v2_Y.ratioInflateLeft_out1 = airbag_13Hz_v2_U.ratioInflateLeft1;
    airbag_13Hz_v2_Y.ratioDeflateLeft_out1 = airbag_13Hz_v2_U.ratioDeflateLeft1;
    airbag_13Hz_v2_Y.leftInflateThreshold_out1 =
      airbag_13Hz_v2_U.leftInflateThreshold1;
    airbag_13Hz_v2_Y.leftDeflateThreshold_out1 =
      airbag_13Hz_v2_U.leftDeflateThreshold1;
    airbag_13Hz_v2_Y.rightInflateThreshold_out1 =
      airbag_13Hz_v2_U.rightInflateThreshold1;
    airbag_13Hz_v2_Y.rightDeflateThreshold_out1 =
      airbag_13Hz_v2_U.rightDeflateThreshold1;
  }

  /* End of Switch: '<Root>/Switch1' */

  /* MATLAB Function: '<Root>/侧翼状态判定1' incorporates:
   *  Inport: '<Root>/backTotalThreshold1'
   */
  avgPrev = airbag_13Hz_v2_Y.backrestData1[0];
  xtmp = airbag_13Hz_v2_Y.backrestData1[28];
  for (newWriteIndex = 0; newWriteIndex < 27; newWriteIndex++) {
    nvmCmd = (int32_T)((uint32_T)(newWriteIndex + 1) / 7U);
    rtb_action = (newWriteIndex + 1) % 7;
    avgPrev += airbag_13Hz_v2_Y.backrestData1[nvmCmd * 7 + rtb_action];
    xtmp += airbag_13Hz_v2_Y.backrestData1[(nvmCmd + 4) * 7 + rtb_action];
  }

  airbag_13Hz_v2_Y.leftPressure1 = avgPrev * 1.30434787F;
  airbag_13Hz_v2_Y.rightPressure1 = xtmp * 1.30434787F;
  avgPrev = airbag_13Hz_v2_Y.backrestData1[0];
  for (newWriteIndex = 0; newWriteIndex < 55; newWriteIndex++) {
    avgPrev += airbag_13Hz_v2_Y.backrestData1[newWriteIndex + 1];
  }

  airbag_13Hz_v2_Y.backMeanTotal_wing1 = avgPrev / 46.0F;
  if ((airbag_13Hz_v2_Y.rightPressure1 > 0.0F) &&
      (airbag_13Hz_v2_Y.backMeanTotal_wing1 >
       airbag_13Hz_v2_U.backTotalThreshold1)) {
    xtmp = airbag_13Hz_v2_Y.leftPressure1 / airbag_13Hz_v2_Y.rightPressure1;
  } else {
    xtmp = (real32_T)!(airbag_13Hz_v2_Y.backMeanTotal_wing1 >
                       airbag_13Hz_v2_U.backTotalThreshold1);
  }

  if (xtmp > airbag_13Hz_v2_Y.ratioDeflateLeft_out1) {
    rtb_leftAction_h = 1;
    idx = 2;
  } else if (xtmp < airbag_13Hz_v2_Y.ratioInflateLeft_out1) {
    rtb_leftAction_h = 2;
    idx = 1;
  } else {
    rtb_leftAction_h = 0;
    idx = 0;
  }

  /* MATLAB Function: '<Root>/腰托气囊控制逻辑1' incorporates:
   *  Inport: '<Root>/backTotalThreshold1'
   */
  avgPrev = airbag_13Hz_v2_Y.backrestData1[0];
  for (newWriteIndex = 0; newWriteIndex < 31; newWriteIndex++) {
    avgPrev += airbag_13Hz_v2_Y.backrestData1[((newWriteIndex + 1) >> 2) * 7 +
      (newWriteIndex + 1) % 4];
  }

  airbag_13Hz_v2_Y.upperMean1 = avgPrev / 22.0F;
  avgPrev = airbag_13Hz_v2_Y.backrestData1[4];
  for (newWriteIndex = 0; newWriteIndex < 23; newWriteIndex++) {
    avgPrev += airbag_13Hz_v2_Y.backrestData1[((int32_T)((uint32_T)
      (newWriteIndex + 1) / 3U) * 7 + (newWriteIndex + 1) % 3) + 4];
  }

  airbag_13Hz_v2_Y.lowerMean1 = avgPrev / 24.0F;
  airbag_13Hz_v2_Y.backMeanTotal_lumbar1 = airbag_13Hz_v2_Y.upperMean1 +
    airbag_13Hz_v2_Y.lowerMean1;
  if (airbag_13Hz_v2_Y.lowerMean1 > 0.0F) {
    avgPrev = airbag_13Hz_v2_Y.upperMean1 / airbag_13Hz_v2_Y.lowerMean1;
  } else {
    avgPrev = 0.0F;
  }

  nvmCmd = (airbag_13Hz_v2_Y.backMeanTotal_lumbar1 >=
            airbag_13Hz_v2_U.backTotalThreshold1);
  if (nvmCmd == 0) {
    rtb_action = 0;
  } else if (avgPrev > airbag_13Hz_v2_Y.ratioInflate_out1) {
    rtb_action = 1;
  } else if (avgPrev < airbag_13Hz_v2_Y.ratioDeflate_out1) {
    rtb_action = 2;
  } else {
    rtb_action = 0;
  }

  /* MATLAB Function: '<Root>/腿托气囊控制逻辑1' */
  adjustCmd = airbag_13Hz_v2_Y.cushionData1[3];
  for (newWriteIndex = 0; newWriteIndex < 11; newWriteIndex++) {
    adjustCmd += airbag_13Hz_v2_Y.cushionData1[((int32_T)((uint32_T)
      (newWriteIndex + 1) / 3U) * 6 + (newWriteIndex + 1) % 3) + 3];
  }

  airbag_13Hz_v2_Y.leftButtMean1 = adjustCmd / 12.0F;
  adjustCmd = airbag_13Hz_v2_Y.cushionData1[1];
  for (newWriteIndex = 0; newWriteIndex < 7; newWriteIndex++) {
    adjustCmd += airbag_13Hz_v2_Y.cushionData1[(((newWriteIndex + 1) >> 1) * 6 +
      (newWriteIndex + 1) % 2) + 1];
  }

  airbag_13Hz_v2_Y.leftLegMean1 = adjustCmd / 8.0F;
  adjustCmd = airbag_13Hz_v2_Y.cushionData1[27];
  for (newWriteIndex = 0; newWriteIndex < 11; newWriteIndex++) {
    adjustCmd += airbag_13Hz_v2_Y.cushionData1[(((int32_T)((uint32_T)
      (newWriteIndex + 1) / 3U) + 4) * 6 + (newWriteIndex + 1) % 3) + 3];
  }

  airbag_13Hz_v2_Y.rightButtMean1 = adjustCmd / 12.0F;
  adjustCmd = airbag_13Hz_v2_Y.cushionData1[25];
  for (newWriteIndex = 0; newWriteIndex < 7; newWriteIndex++) {
    adjustCmd += airbag_13Hz_v2_Y.cushionData1[((((newWriteIndex + 1) >> 1) + 4)
      * 6 + (newWriteIndex + 1) % 2) + 1];
  }

  airbag_13Hz_v2_Y.rightLegMean1 = adjustCmd / 8.0F;
  if (airbag_13Hz_v2_Y.leftButtMean1 > 0.0F) {
    adjustCmd = airbag_13Hz_v2_Y.leftLegMean1 / airbag_13Hz_v2_Y.leftButtMean1;
  } else {
    adjustCmd = 0.0F;
  }

  if (airbag_13Hz_v2_Y.rightButtMean1 > 0.0F) {
    baseInflationSeconds = airbag_13Hz_v2_Y.rightLegMean1 /
      airbag_13Hz_v2_Y.rightButtMean1;
  } else {
    baseInflationSeconds = 0.0F;
  }

  if (adjustCmd < airbag_13Hz_v2_Y.leftInflateThreshold_out1) {
    rtb_leftAction = 1;
  } else if (adjustCmd > airbag_13Hz_v2_Y.leftDeflateThreshold_out1) {
    rtb_leftAction = 2;
  } else {
    rtb_leftAction = 0;
  }

  if (baseInflationSeconds < airbag_13Hz_v2_Y.rightInflateThreshold_out1) {
    rtb_rightAction = 1;
  } else if (baseInflationSeconds > airbag_13Hz_v2_Y.rightDeflateThreshold_out1)
  {
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
  if (airbag_13Hz_v2_U.resetFlag1 || newReason) {
    memset(&airbag_13Hz_v2_DW.pCopBufX[0], 0, 125U * sizeof(real32_T));
    memset(&airbag_13Hz_v2_DW.pCopBufY[0], 0, 125U * sizeof(real32_T));
    airbag_13Hz_v2_DW.pBufLen = 0;
    airbag_13Hz_v2_DW.pWriteIndex = 0;
    airbag_13Hz_v2_DW.pFrameCount = 0;
    airbag_13Hz_v2_DW.pPeakPressure = 0.0F;
    airbag_13Hz_v2_DW.pSumX = 0.0F;
    airbag_13Hz_v2_DW.pSumY = 0.0F;
    airbag_13Hz_v2_DW.pSumX2 = 0.0F;
    airbag_13Hz_v2_DW.pSumY2 = 0.0F;
    airbag_13Hz_v2_DW.pPathLength = 0.0F;
    airbag_13Hz_v2_DW.pPathCompensation = 0.0F;
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
        rtb_cop_x = airbag_13Hz_v2_Y.backrestData1[newWriteIndex * 7 + i];
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
        b_pressure = airbag_13Hz_v2_Y.cushionData1[newWriteIndex * 6 + i];
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
      if (airbag_13Hz_v2_DW.pFrameCount <= 2147483646) {
        airbag_13Hz_v2_DW.pFrameCount++;
      }

      if (rtb_cushionSum_a > airbag_13Hz_v2_DW.pPeakPressure) {
        airbag_13Hz_v2_DW.pPeakPressure = rtb_cushionSum_a;
      }

      if ((airbag_13Hz_v2_DW.pFrameCount > 10) && (!(rtb_cushionSum_a <
            airbag_13Hz_v2_DW.pPeakPressure * 0.8F)) && (!(rtb_cushionSum_a <
            200.0F))) {
        rtb_isStable = 1;
        if (airbag_13Hz_v2_DW.pWriteIndex > 2147483646) {
          i = MAX_int32_T;
        } else {
          i = airbag_13Hz_v2_DW.pWriteIndex + 1;
        }

        newWriteIndex = i - 1;
        if (airbag_13Hz_v2_DW.pWriteIndex > 2147483646) {
          i = MAX_int32_T;
        } else {
          i = airbag_13Hz_v2_DW.pWriteIndex + 1;
        }

        if (i > 125) {
          newWriteIndex = 0;
        }

        addedEdgeLength = 0.0F;
        if (airbag_13Hz_v2_DW.pBufLen > 0) {
          i = newWriteIndex - 1;
          if (newWriteIndex < 1) {
            i = 124;
          }

          b_pressure = rtb_cop_x - airbag_13Hz_v2_DW.pCopBufX[i];
          dyNew = b_weightedY - airbag_13Hz_v2_DW.pCopBufY[i];
          addedEdgeLength = (real32_T)sqrt(b_pressure * b_pressure + dyNew *
            dyNew);
        }

        if (airbag_13Hz_v2_DW.pBufLen < 125) {
          airbag_13Hz_v2_DW.pBufLen++;
          airbag_13Hz_v2_DW.pSumX += rtb_cop_x;
          airbag_13Hz_v2_DW.pSumY += b_weightedY;
          airbag_13Hz_v2_DW.pSumX2 += rtb_cop_x * rtb_cop_x;
          airbag_13Hz_v2_DW.pSumY2 += b_weightedY * b_weightedY;
          pathIncrement = addedEdgeLength - airbag_13Hz_v2_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_v2_DW.pPathLength + pathIncrement;
          airbag_13Hz_v2_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_v2_DW.pPathLength) - pathIncrement;
          airbag_13Hz_v2_DW.pPathLength = addedEdgeLength;
        } else {
          i = newWriteIndex + 1;
          if (newWriteIndex + 2 > 125) {
            i = 0;
          }

          b_pressure = airbag_13Hz_v2_DW.pCopBufX[i] -
            airbag_13Hz_v2_DW.pCopBufX[newWriteIndex];
          dyNew = airbag_13Hz_v2_DW.pCopBufY[i] -
            airbag_13Hz_v2_DW.pCopBufY[newWriteIndex];
          airbag_13Hz_v2_DW.pSumX = (airbag_13Hz_v2_DW.pSumX + rtb_cop_x) -
            airbag_13Hz_v2_DW.pCopBufX[newWriteIndex];
          airbag_13Hz_v2_DW.pSumY = (airbag_13Hz_v2_DW.pSumY + b_weightedY) -
            airbag_13Hz_v2_DW.pCopBufY[newWriteIndex];
          airbag_13Hz_v2_DW.pSumX2 = (rtb_cop_x * rtb_cop_x +
            airbag_13Hz_v2_DW.pSumX2) - airbag_13Hz_v2_DW.pCopBufX[newWriteIndex]
            * airbag_13Hz_v2_DW.pCopBufX[newWriteIndex];
          airbag_13Hz_v2_DW.pSumY2 = (b_weightedY * b_weightedY +
            airbag_13Hz_v2_DW.pSumY2) - airbag_13Hz_v2_DW.pCopBufY[newWriteIndex]
            * airbag_13Hz_v2_DW.pCopBufY[newWriteIndex];
          pathIncrement = addedEdgeLength - airbag_13Hz_v2_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_v2_DW.pPathLength + pathIncrement;
          airbag_13Hz_v2_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_v2_DW.pPathLength) - pathIncrement;
          airbag_13Hz_v2_DW.pPathLength = addedEdgeLength;
          pathIncrement = -(real32_T)sqrt(b_pressure * b_pressure + dyNew *
            dyNew) - airbag_13Hz_v2_DW.pPathCompensation;
          addedEdgeLength = airbag_13Hz_v2_DW.pPathLength + pathIncrement;
          airbag_13Hz_v2_DW.pPathCompensation = (addedEdgeLength -
            airbag_13Hz_v2_DW.pPathLength) - pathIncrement;
          airbag_13Hz_v2_DW.pPathLength = addedEdgeLength;
          if (airbag_13Hz_v2_DW.pPathLength < 0.0F) {
            airbag_13Hz_v2_DW.pPathLength = 0.0F;
            airbag_13Hz_v2_DW.pPathCompensation = 0.0F;
          }
        }

        airbag_13Hz_v2_DW.pCopBufX[newWriteIndex] = rtb_cop_x;
        airbag_13Hz_v2_DW.pCopBufY[newWriteIndex] = b_weightedY;
        airbag_13Hz_v2_DW.pWriteIndex = newWriteIndex + 1;
        if (airbag_13Hz_v2_DW.pBufLen >= 2) {
          rtb_delta_x = airbag_13Hz_v2_DW.pCopBufX[0];
          rtb_avg_velocity = airbag_13Hz_v2_DW.pCopBufX[0];
          rtb_delta_y = airbag_13Hz_v2_DW.pCopBufY[0];
          rtb_rms_displacement = airbag_13Hz_v2_DW.pCopBufY[0];
          for (newWriteIndex = 2; newWriteIndex <= airbag_13Hz_v2_DW.pBufLen;
               newWriteIndex++) {
            b_weightedY = airbag_13Hz_v2_DW.pCopBufX[newWriteIndex - 1];
            if (b_weightedY < rtb_delta_x) {
              rtb_delta_x = b_weightedY;
            } else if (b_weightedY > rtb_avg_velocity) {
              rtb_avg_velocity = b_weightedY;
            }

            b_weightedY = airbag_13Hz_v2_DW.pCopBufY[newWriteIndex - 1];
            if (b_weightedY < rtb_delta_y) {
              rtb_delta_y = b_weightedY;
            } else if (b_weightedY > rtb_rms_displacement) {
              rtb_rms_displacement = b_weightedY;
            }
          }

          rtb_delta_x = (rtb_avg_velocity - rtb_delta_x) * 7.0F;
          rtb_delta_y = (rtb_rms_displacement - rtb_delta_y) * 7.0F;
          rtb_rms_displacement = (airbag_13Hz_v2_DW.pSumX2 +
            airbag_13Hz_v2_DW.pSumY2) - (airbag_13Hz_v2_DW.pSumX *
            airbag_13Hz_v2_DW.pSumX + airbag_13Hz_v2_DW.pSumY *
            airbag_13Hz_v2_DW.pSumY) / (real32_T)airbag_13Hz_v2_DW.pBufLen;
          if (rtb_rms_displacement < 0.0F) {
            rtb_rms_displacement = 0.0F;
          }

          rtb_rms_displacement = (real32_T)sqrt(rtb_rms_displacement / (real32_T)
            airbag_13Hz_v2_DW.pBufLen) * 0.7F;
          rtb_avg_velocity = airbag_13Hz_v2_DW.pPathLength / 0.0769230798F *
            7.0F / (real32_T)airbag_13Hz_v2_DW.pBufLen;
        }
      }
    }
  }

  /* Outport: '<Root>/spineProtectActive1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_v2_Y.spineProtectActive1 = 0.0F;

  /* Outport: '<Root>/spineProtectSide1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_v2_Y.spineProtectSide1 = 0.0F;

  /* Outport: '<Root>/bumpReliefActive1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_v2_Y.bumpReliefActive1 = 0.0F;

  /* Outport: '<Root>/motionSicknessActive1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_v2_Y.motionSicknessActive1 = 0.0F;

  /* MATLAB Function: '<Root>/健康干预控制1' */
  rtb_healthSideWingLeftAction = 0;
  rtb_healthSideWingRightAction = 0;
  newWriteIndex = 0;

  /* Outport: '<Root>/spineBiasSeconds1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_v2_Y.spineBiasSeconds1 = 0.0F;

  /* Outport: '<Root>/bumpDetectSeconds1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_v2_Y.bumpDetectSeconds1 = 0.0F;

  /* MATLAB Function: '<Root>/健康干预控制1' */
  airbag_13Hz_v2_Y.cushionForwardMoveMm1 = 0.0F;
  airbag_13Hz_v2_Y.backrestDropRatio1 = 1.0F;

  /* Outport: '<Root>/sickEventCount1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_v2_Y.sickEventCount1 = 0.0F;

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
  spineThreshold = airbag_13Hz_v2_U.spineTimeThresholdSec1;
  if (rtIsInfF(airbag_13Hz_v2_U.spineTimeThresholdSec1) || rtIsNaNF
      (airbag_13Hz_v2_U.spineTimeThresholdSec1)) {
    spineThreshold = 60.0F;
  } else if (airbag_13Hz_v2_U.spineTimeThresholdSec1 <= 0.0F) {
    spineThreshold = 60.0F;
  }

  b_weightedY = airbag_13Hz_v2_U.bumpTimeThresholdSec1;
  if (rtIsInfF(airbag_13Hz_v2_U.bumpTimeThresholdSec1) || rtIsNaNF
      (airbag_13Hz_v2_U.bumpTimeThresholdSec1)) {
    b_weightedY = 10.0F;
  } else if (airbag_13Hz_v2_U.bumpTimeThresholdSec1 <= 0.0F) {
    b_weightedY = 10.0F;
  }

  spineDeadband = airbag_13Hz_v2_U.spineBiasDeadband1;
  if (rtIsInfF(airbag_13Hz_v2_U.spineBiasDeadband1) || rtIsNaNF
      (airbag_13Hz_v2_U.spineBiasDeadband1)) {
    spineDeadband = 0.5F;
  } else if (airbag_13Hz_v2_U.spineBiasDeadband1 <= 0.0F) {
    spineDeadband = 0.5F;
  }

  b_pressure = airbag_13Hz_v2_U.sickForwardMinMm1;
  if (rtIsInfF(airbag_13Hz_v2_U.sickForwardMinMm1) || rtIsNaNF
      (airbag_13Hz_v2_U.sickForwardMinMm1)) {
    b_pressure = 2.0F;
  } else if (airbag_13Hz_v2_U.sickForwardMinMm1 <= 0.0F) {
    b_pressure = 2.0F;
  }

  dyNew = airbag_13Hz_v2_U.sickBackDropRatio1;
  if (rtIsInfF(airbag_13Hz_v2_U.sickBackDropRatio1) || rtIsNaNF
      (airbag_13Hz_v2_U.sickBackDropRatio1)) {
    dyNew = 0.7F;
  } else if ((airbag_13Hz_v2_U.sickBackDropRatio1 <= 0.0F) ||
             (airbag_13Hz_v2_U.sickBackDropRatio1 >= 1.0F)) {
    dyNew = 0.7F;
  }

  addedEdgeLength = airbag_13Hz_v2_U.sickPairWindowSec1;
  if (rtIsInfF(airbag_13Hz_v2_U.sickPairWindowSec1) || rtIsNaNF
      (airbag_13Hz_v2_U.sickPairWindowSec1)) {
    addedEdgeLength = 3.0F;
  } else if (airbag_13Hz_v2_U.sickPairWindowSec1 <= 0.0F) {
    addedEdgeLength = 3.0F;
  }

  pathIncrement = airbag_13Hz_v2_U.bumpMinVelocity1;
  if (rtIsInfF(airbag_13Hz_v2_U.bumpMinVelocity1) || rtIsNaNF
      (airbag_13Hz_v2_U.bumpMinVelocity1)) {
    pathIncrement = 4.0F;
  } else if (airbag_13Hz_v2_U.bumpMinVelocity1 <= 0.0F) {
    pathIncrement = 4.0F;
  }

  bumpRmsMax = airbag_13Hz_v2_U.bumpMaxRms1;
  if (rtIsInfF(airbag_13Hz_v2_U.bumpMaxRms1) || rtIsNaNF
      (airbag_13Hz_v2_U.bumpMaxRms1)) {
    bumpRmsMax = 1.2F;
  } else if (airbag_13Hz_v2_U.bumpMaxRms1 <= 0.0F) {
    bumpRmsMax = 1.2F;
  }

  bumpRangeMax = airbag_13Hz_v2_U.bumpMaxRangeMm1;
  if (rtIsInfF(airbag_13Hz_v2_U.bumpMaxRangeMm1) || rtIsNaNF
      (airbag_13Hz_v2_U.bumpMaxRangeMm1)) {
    bumpRangeMax = 25.0F;
  } else if (airbag_13Hz_v2_U.bumpMaxRangeMm1 <= 0.0F) {
    bumpRangeMax = 25.0F;
  }

  if (rtb_stateChanged || airbag_13Hz_v2_U.resetFlag1 || newReason) {
    airbag_13Hz_v2_DW.pSpineBiasSec = 0.0F;
    airbag_13Hz_v2_DW.pSpineDir = 0.0F;
    airbag_13Hz_v2_DW.pSpineActive = 0.0F;
    airbag_13Hz_v2_DW.pSpineNeutralSec = 0.0F;
    airbag_13Hz_v2_DW.pSpineActionTimer = 0.0F;
    airbag_13Hz_v2_DW.pBumpDetectSec = 0.0F;
    airbag_13Hz_v2_DW.pBumpClearSec = 0.0F;
    airbag_13Hz_v2_DW.pBumpLatched = 0.0F;
    airbag_13Hz_v2_DW.pBumpActionTimer = 0.0F;
    airbag_13Hz_v2_DW.pHistoryValid = 0.0F;
    airbag_13Hz_v2_DW.pForwardRefX = 0.0F;
    airbag_13Hz_v2_DW.pForwardAge = 0.0F;
    airbag_13Hz_v2_DW.pBackDropWindow = 0.0F;
    airbag_13Hz_v2_DW.pSickPromptTimer = 0.0F;
    airbag_13Hz_v2_DW.pBackPeakSum = 0.0F;
    airbag_13Hz_v2_DW.pBackPeakAge = 0.0F;
    airbag_13Hz_v2_DW.pSickEventCount = 0.0F;
    airbag_13Hz_v2_DW.pSickEventGap = 0.0F;
    airbag_13Hz_v2_DW.pSickCountAge = 0.0F;
  } else {
    newReason = !rtIsInfF(adoptionFrequency);
    manualNow = (newReason && (adoptionFrequency >= 100.0F));
    rtb_stateChanged = ((!rtIsInfF(rtb_cushionSum_a)) && (rtb_cushionSum_a >=
      200.0F));
    if (airbag_13Hz_v2_DW.pHistoryValid == 0.0F) {
      airbag_13Hz_v2_DW.pForwardRefX = rtb_cop_x;
      airbag_13Hz_v2_DW.pForwardAge = 0.0F;
      airbag_13Hz_v2_DW.pBackPeakSum = adoptionFrequency;
      airbag_13Hz_v2_DW.pBackPeakAge = 0.0F;
      airbag_13Hz_v2_DW.pHistoryValid = 1.0F;
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
      airbag_13Hz_v2_DW.pSpineNeutralSec = 0.0F;
      if (i == airbag_13Hz_v2_DW.pSpineDir) {
        airbag_13Hz_v2_DW.pSpineBiasSec += 0.0769230798F;
      } else {
        airbag_13Hz_v2_DW.pSpineDir = (real32_T)i;
        airbag_13Hz_v2_DW.pSpineBiasSec = 0.0769230798F;
        airbag_13Hz_v2_DW.pSpineActive = 0.0F;
        airbag_13Hz_v2_DW.pSpineActionTimer = 0.0F;
      }

      if ((airbag_13Hz_v2_DW.pSpineBiasSec >= spineThreshold) &&
          (airbag_13Hz_v2_DW.pSpineActive == 0.0F)) {
        airbag_13Hz_v2_DW.pSpineActive = 1.0F;
        airbag_13Hz_v2_DW.pSpineActionTimer = 2.0F;
      }
    }

    if (guard1) {
      airbag_13Hz_v2_DW.pSpineNeutralSec += 0.0769230798F;
      if ((airbag_13Hz_v2_DW.pSpineNeutralSec >= 5.0F) || (!manualNow)) {
        airbag_13Hz_v2_DW.pSpineBiasSec = 0.0F;
        airbag_13Hz_v2_DW.pSpineDir = 0.0F;
        airbag_13Hz_v2_DW.pSpineActive = 0.0F;
        airbag_13Hz_v2_DW.pSpineActionTimer = 0.0F;
      }
    }

    rtb_backrest_cop_y = fmaxf(rtb_delta_x, rtb_delta_y);
    if (rtb_stateChanged && (rtb_isStable == 1) && ((!rtIsInfF(rtb_avg_velocity))
         && (!rtIsNaNF(rtb_avg_velocity)) && ((!rtIsInfF(rtb_rms_displacement)) &&
          (!rtIsNaNF(rtb_rms_displacement)) && ((!rtIsInfF(rtb_backrest_cop_y)) &&
           (!rtIsNaNF(rtb_backrest_cop_y)) && ((rtb_avg_velocity >=
             pathIncrement) && (rtb_rms_displacement <= bumpRmsMax) &&
            (rtb_backrest_cop_y <= bumpRangeMax)))))) {
      airbag_13Hz_v2_DW.pBumpClearSec = 0.0F;
      if (airbag_13Hz_v2_DW.pBumpLatched == 0.0F) {
        airbag_13Hz_v2_DW.pBumpDetectSec += 0.0769230798F;
        if (airbag_13Hz_v2_DW.pBumpDetectSec >= b_weightedY) {
          airbag_13Hz_v2_DW.pBumpLatched = 1.0F;
          airbag_13Hz_v2_DW.pBumpActionTimer = 2.0F;
        }
      }
    } else {
      airbag_13Hz_v2_DW.pBumpClearSec += 0.0769230798F;
      if (airbag_13Hz_v2_DW.pBumpLatched == 0.0F) {
        airbag_13Hz_v2_DW.pBumpDetectSec -= 0.15384616F;
        if (airbag_13Hz_v2_DW.pBumpDetectSec < 0.0F) {
          airbag_13Hz_v2_DW.pBumpDetectSec = 0.0F;
        }
      } else if (airbag_13Hz_v2_DW.pBumpClearSec >= 1.0F) {
        airbag_13Hz_v2_DW.pBumpLatched = 0.0F;
        airbag_13Hz_v2_DW.pBumpDetectSec = 0.0F;
      }
    }

    if (rtb_stateChanged && ((!rtIsInfF(rtb_cop_x)) && (!rtIsNaNF(rtb_cop_x))))
    {
      airbag_13Hz_v2_DW.pForwardAge += 0.0769230798F;
      if (rtIsInfF(airbag_13Hz_v2_U.cushionForwardSign1) || rtIsNaNF
          (airbag_13Hz_v2_U.cushionForwardSign1)) {
        i = -1;
      } else if (airbag_13Hz_v2_U.cushionForwardSign1 == 0.0F) {
        i = -1;
      } else if (airbag_13Hz_v2_U.cushionForwardSign1 > 0.0F) {
        i = 1;
      } else {
        i = -1;
      }

      airbag_13Hz_v2_Y.cushionForwardMoveMm1 = (rtb_cop_x -
        airbag_13Hz_v2_DW.pForwardRefX) * (real32_T)i * 7.0F;
      if (airbag_13Hz_v2_Y.cushionForwardMoveMm1 < -1.0F) {
        airbag_13Hz_v2_DW.pForwardRefX = rtb_cop_x;
        airbag_13Hz_v2_DW.pForwardAge = 0.0F;
        airbag_13Hz_v2_Y.cushionForwardMoveMm1 = 0.0F;
      }
    } else {
      airbag_13Hz_v2_DW.pForwardRefX = rtb_cop_x;
      airbag_13Hz_v2_DW.pForwardAge = 0.0F;
    }

    if (newReason && (adoptionFrequency >= airbag_13Hz_v2_DW.pBackPeakSum)) {
      airbag_13Hz_v2_DW.pBackPeakSum = adoptionFrequency;
      airbag_13Hz_v2_DW.pBackPeakAge = 0.0F;
    } else {
      airbag_13Hz_v2_DW.pBackPeakAge += 0.0769230798F;
      if (airbag_13Hz_v2_DW.pBackPeakAge >= 1.5F) {
        if (newReason) {
          if (adoptionFrequency > 0.0F) {
            airbag_13Hz_v2_DW.pBackPeakSum = adoptionFrequency;
          } else {
            airbag_13Hz_v2_DW.pBackPeakSum = 0.0F;
          }
        } else {
          airbag_13Hz_v2_DW.pBackPeakSum = 0.0F;
        }

        airbag_13Hz_v2_DW.pBackPeakAge = 0.0F;
      }
    }

    if ((!rtIsInfF(airbag_13Hz_v2_DW.pBackPeakSum)) && (!rtIsNaNF
         (airbag_13Hz_v2_DW.pBackPeakSum)) && (airbag_13Hz_v2_DW.pBackPeakSum >
         0.0F) && newReason) {
      airbag_13Hz_v2_Y.backrestDropRatio1 = adoptionFrequency /
        airbag_13Hz_v2_DW.pBackPeakSum;
    }

    if ((airbag_13Hz_v2_DW.pBackPeakSum >= 100.0F) && (newReason &&
         ((adoptionFrequency <= 50.0F) || (airbag_13Hz_v2_Y.backrestDropRatio1 <=
           dyNew)))) {
      airbag_13Hz_v2_DW.pBackDropWindow = addedEdgeLength;
    }

    if ((airbag_13Hz_v2_DW.pBackDropWindow > 0.0F) && rtb_stateChanged &&
        (airbag_13Hz_v2_Y.cushionForwardMoveMm1 >= b_pressure) &&
        (airbag_13Hz_v2_DW.pSickEventGap <= 0.0F)) {
      airbag_13Hz_v2_DW.pSickEventCount++;
      airbag_13Hz_v2_DW.pSickEventGap = 3.0F;
      airbag_13Hz_v2_DW.pSickCountAge = 0.0F;
      airbag_13Hz_v2_DW.pBackDropWindow = 0.0F;
      airbag_13Hz_v2_DW.pForwardRefX = rtb_cop_x;
      airbag_13Hz_v2_DW.pForwardAge = 0.0F;
      airbag_13Hz_v2_DW.pBackPeakSum = adoptionFrequency;
      airbag_13Hz_v2_DW.pBackPeakAge = 0.0F;
      if (airbag_13Hz_v2_DW.pSickEventCount >= 3.0F) {
        airbag_13Hz_v2_DW.pSickPromptTimer = 10.0F;
        airbag_13Hz_v2_DW.pSickEventCount = 0.0F;
      }
    }

    if (airbag_13Hz_v2_DW.pSickEventCount > 0.0F) {
      airbag_13Hz_v2_DW.pSickCountAge += 0.0769230798F;
      if (airbag_13Hz_v2_DW.pSickCountAge >= 300.0F) {
        airbag_13Hz_v2_DW.pSickEventCount = 0.0F;
        airbag_13Hz_v2_DW.pSickCountAge = 0.0F;
      }
    }

    if (airbag_13Hz_v2_DW.pForwardAge >= 3.0F) {
      airbag_13Hz_v2_DW.pForwardRefX = rtb_cop_x;
      airbag_13Hz_v2_DW.pForwardAge = 0.0F;
    }

    /* Outport: '<Root>/spineProtectActive1' incorporates:
     *  Inport: '<Root>/ cushionForwardSign1'
     */
    airbag_13Hz_v2_Y.spineProtectActive1 = airbag_13Hz_v2_DW.pSpineActive;
    if (airbag_13Hz_v2_DW.pSpineActive == 1.0F) {
      /* Outport: '<Root>/spineProtectSide1' */
      airbag_13Hz_v2_Y.spineProtectSide1 = airbag_13Hz_v2_DW.pSpineDir;
      newWriteIndex = 1;
    }

    /* Outport: '<Root>/bumpReliefActive1' */
    airbag_13Hz_v2_Y.bumpReliefActive1 = airbag_13Hz_v2_DW.pBumpLatched;
    if (airbag_13Hz_v2_DW.pBumpLatched == 1.0F) {
      newWriteIndex += 2;
    }

    if (airbag_13Hz_v2_DW.pSickPromptTimer > 0.0F) {
      /* Outport: '<Root>/motionSicknessActive1' */
      airbag_13Hz_v2_Y.motionSicknessActive1 = 1.0F;
      newWriteIndex += 4;
    }

    if (airbag_13Hz_v2_DW.pSpineActionTimer > 0.0F) {
      if (airbag_13Hz_v2_DW.pSpineDir < 0.0F) {
        rtb_healthSideWingLeftAction = 1;
      } else if (airbag_13Hz_v2_DW.pSpineDir > 0.0F) {
        rtb_healthSideWingRightAction = 1;
      }
    }

    if (airbag_13Hz_v2_DW.pBumpActionTimer > 0.0F) {
      rtb_healthSideWingLeftAction = 1;
      rtb_healthSideWingRightAction = 1;
    }

    /* Outport: '<Root>/spineBiasSeconds1' */
    airbag_13Hz_v2_Y.spineBiasSeconds1 = airbag_13Hz_v2_DW.pSpineBiasSec;

    /* Outport: '<Root>/bumpDetectSeconds1' */
    airbag_13Hz_v2_Y.bumpDetectSeconds1 = airbag_13Hz_v2_DW.pBumpDetectSec;

    /* Outport: '<Root>/sickEventCount1' */
    airbag_13Hz_v2_Y.sickEventCount1 = airbag_13Hz_v2_DW.pSickEventCount;
    if (airbag_13Hz_v2_DW.pSpineActionTimer > 0.0F) {
      airbag_13Hz_v2_DW.pSpineActionTimer -= 0.0769230798F;
      if (airbag_13Hz_v2_DW.pSpineActionTimer < 0.0F) {
        airbag_13Hz_v2_DW.pSpineActionTimer = 0.0F;
      }
    }

    if (airbag_13Hz_v2_DW.pBumpActionTimer > 0.0F) {
      airbag_13Hz_v2_DW.pBumpActionTimer -= 0.0769230798F;
      if (airbag_13Hz_v2_DW.pBumpActionTimer < 0.0F) {
        airbag_13Hz_v2_DW.pBumpActionTimer = 0.0F;
      }
    }

    if (airbag_13Hz_v2_DW.pBackDropWindow > 0.0F) {
      airbag_13Hz_v2_DW.pBackDropWindow -= 0.0769230798F;
      if (airbag_13Hz_v2_DW.pBackDropWindow < 0.0F) {
        airbag_13Hz_v2_DW.pBackDropWindow = 0.0F;
      }
    }

    if (airbag_13Hz_v2_DW.pSickPromptTimer > 0.0F) {
      airbag_13Hz_v2_DW.pSickPromptTimer -= 0.0769230798F;
      if (airbag_13Hz_v2_DW.pSickPromptTimer < 0.0F) {
        airbag_13Hz_v2_DW.pSickPromptTimer = 0.0F;
      }
    }

    if (airbag_13Hz_v2_DW.pSickEventGap > 0.0F) {
      airbag_13Hz_v2_DW.pSickEventGap -= 0.0769230798F;
      if (airbag_13Hz_v2_DW.pSickEventGap < 0.0F) {
        airbag_13Hz_v2_DW.pSickEventGap = 0.0F;
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
  rtb_cop_x = airbag_13Hz_v2_U.welcomeSideWingTime1;
  rtb_backrest_cop_y = airbag_13Hz_v2_U.welcomeLumbarTime1;
  adoptionFrequency = airbag_13Hz_v2_U.welcomeHipTime1;
  rtb_cushionSum_a = airbag_13Hz_v2_U.welcomeLegTime1;
  if (airbag_13Hz_v2_U.welcomeSideWingTime1 <= 0.0F) {
    rtb_cop_x = 2.0F;
  }

  if (airbag_13Hz_v2_U.welcomeLumbarTime1 <= 0.0F) {
    rtb_backrest_cop_y = 3.0F;
  }

  if (airbag_13Hz_v2_U.welcomeHipTime1 <= 0.0F) {
    adoptionFrequency = 3.0F;
  }

  if (airbag_13Hz_v2_U.welcomeLegTime1 <= 0.0F) {
    rtb_cushionSum_a = 2.0F;
  }

  airbag_13Hz_v2_Y.inflation_time_out1 = ((rtb_cop_x + rtb_backrest_cop_y) +
    adoptionFrequency) + rtb_cushionSum_a;
  airbag_13Hz_v2_Y.inflation_time1_out1 = fmaxf(0.0F,
    airbag_13Hz_v2_U.inflation_time3);
  airbag_13Hz_v2_Y.holding_time_out1 = fmaxf(0.0F,
    airbag_13Hz_v2_U.holding_time1);
  airbag_13Hz_v2_Y.deflation_time_out1 = fmaxf(0.0F,
    airbag_13Hz_v2_U.deflation_time1);
  rtb_cushionSum_a = fmaxf(1.0F, airbag_13Hz_v2_U.adoption_frequency1);
  manualNow = ((real32_T)rtb_isOccupied > 0.5F);
  rtb_isOccupied = (rtb_massageEnable >= 0.5F);
  newReason = (rtb_reasonCode != airbag_13Hz_v2_DW.pPrevReasonCode);
  if ((newReason && (rtb_reasonCode == 4)) || ((rtb_reasonCode == 4) &&
       (airbag_13Hz_v2_DW.mode != 4.0F))) {
    if (airbag_13Hz_v2_DW.mode == 1.0F) {
      airbag_13Hz_v2_DW.mode = 4.0F;
      airbag_13Hz_v2_DW.elapsed_time = fmaxf(0.0F,
        airbag_13Hz_v2_Y.deflation_time_out1 * rtb_cushionSum_a -
        airbag_13Hz_v2_DW.elapsed_time);
    } else {
      airbag_13Hz_v2_DW.mode = 4.0F;
      airbag_13Hz_v2_DW.elapsed_time = 0.0F;
    }
  } else if (newReason && tmp_0) {
    airbag_13Hz_v2_DW.mode = 1.0F;
    airbag_13Hz_v2_DW.elapsed_time = 0.0F;
  }

  living = (manualNow && airbag_13Hz_v2_DW.unlocked && ((airbag_13Hz_v2_DW.mode ==
              2.0F) || (airbag_13Hz_v2_DW.mode == 3.0F)) && (!rtb_isOccupied));
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
  if (idx == 1) {
    rtb_isStable = 3;
  } else if (idx == 2) {
    rtb_isStable = 4;
  }

  LumbarlumbarGear = 0;
  if (rtb_action == 1) {
    LumbarlumbarGear = 3;
  } else if (rtb_action == 2) {
    LumbarlumbarGear = 4;
  }

  rtb_action = 0;
  if (rtb_healthSideWingLeftAction == 1) {
    rtb_action = 3;
  }

  rtb_leftAction_h = 0;
  if (rtb_healthSideWingRightAction == 1) {
    rtb_leftAction_h = 3;
  }

  /* Outport: '<Root>/frame1' incorporates:
   *  MATLAB Function: '<Root>/气囊控制协议1'
   */
  memset(&airbag_13Hz_v2_Y.frame1[0], 0, 55U * sizeof(real32_T));

  /* MATLAB Function: '<Root>/气囊控制协议1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion25'
   *  MATLAB Function: '<Root>/品味系数1'
   *  MATLAB Function: '<Root>/活体检测1'
   *  Outport: '<Root>/frame1'
   */
  airbag_13Hz_v2_Y.frame1[0] = 31.0F;
  switch ((int32_T)airbag_13Hz_v2_DW.mode) {
   case 1:
    rtb_massageEnable = 3;
    rtb_cop_x *= rtb_cushionSum_a;
    rtb_backrest_cop_y = rtb_backrest_cop_y * rtb_cushionSum_a + rtb_cop_x;
    if (airbag_13Hz_v2_DW.elapsed_time < rtb_cop_x) {
      rtb_massageEnable = 0;
    } else if (airbag_13Hz_v2_DW.elapsed_time < rtb_backrest_cop_y) {
      rtb_massageEnable = 1;
    } else if (airbag_13Hz_v2_DW.elapsed_time < adoptionFrequency *
               rtb_cushionSum_a + rtb_backrest_cop_y) {
      rtb_massageEnable = 2;
    }

    rtb_massageEnable = (rtb_massageEnable << 1) + 3;
    for (rtb_rightAction = 0; rtb_rightAction < 24; rtb_rightAction++) {
      idx = rtb_rightAction << 1;
      airbag_13Hz_v2_Y.frame1[idx + 1] = (real32_T)rtb_rightAction + 1.0F;
      if (((rtb_rightAction + 1 == rtb_massageEnable) || (rtb_rightAction ==
            rtb_massageEnable)) && airbag_13Hz_v2_DW.unlocked && manualNow) {
        airbag_13Hz_v2_Y.frame1[idx + 2] = 3.0F;
      } else {
        airbag_13Hz_v2_Y.frame1[idx + 2] = 0.0F;
      }
    }

    if (airbag_13Hz_v2_DW.unlocked && manualNow) {
      airbag_13Hz_v2_DW.elapsed_time++;
      if (airbag_13Hz_v2_DW.elapsed_time >= airbag_13Hz_v2_Y.inflation_time_out1
          * rtb_cushionSum_a) {
        airbag_13Hz_v2_DW.mode = 2.0F;
        airbag_13Hz_v2_DW.elapsed_time = 0.0F;
      }
    } else {
      airbag_13Hz_v2_DW.elapsed_time = 0.0F;
    }
    break;

   case 2:
    for (i = 0; i < 24; i++) {
      idx = (i << 1) + 1;
      airbag_13Hz_v2_Y.frame1[idx] = (real32_T)i + 1.0F;
      airbag_13Hz_v2_Y.frame1[idx + 1] = 0.0F;
    }

    if ((real32_T)gapActive > 0.5F) {
      airbag_13Hz__applyAdaptiveGears(airbag_13Hz_v2_Y.frame1, (real32_T)
        rtb_rightAction, (real32_T)rtb_isStable, (real32_T)LumbarlumbarGear,
        (real32_T)rtb_massageEnable, (real32_T)rtb_leftAction);
      airbag_13Hz_v2_DW.elapsed_time++;
      if (airbag_13Hz_v2_DW.elapsed_time >= airbag_13Hz_v2_Y.holding_time_out1 *
          rtb_cushionSum_a) {
        airbag_13Hz_v2_DW.mode = 3.0F;
        airbag_13Hz_v2_DW.elapsed_time = 0.0F;
      }
    }
    break;

   case 3:
    for (i = 0; i < 24; i++) {
      idx = (i << 1) + 1;
      airbag_13Hz_v2_Y.frame1[idx] = (real32_T)i + 1.0F;
      airbag_13Hz_v2_Y.frame1[idx + 1] = 0.0F;
    }

    if ((real32_T)gapActive > 0.5F) {
      airbag_13Hz__applyAdaptiveGears(airbag_13Hz_v2_Y.frame1, (real32_T)
        rtb_rightAction, (real32_T)rtb_isStable, (real32_T)LumbarlumbarGear,
        (real32_T)rtb_massageEnable, (real32_T)rtb_leftAction);
      airbag_13Hz_v2_Y.frame1[14] = 3.0F;
      airbag_13Hz_v2_Y.frame1[16] = 3.0F;
      airbag_13Hz_v2_DW.elapsed_time++;
      if (airbag_13Hz_v2_DW.elapsed_time >=
          airbag_13Hz_v2_Y.inflation_time1_out1 * rtb_cushionSum_a) {
        airbag_13Hz_v2_DW.mode = 2.0F;
        airbag_13Hz_v2_DW.elapsed_time = 0.0F;
      }
    } else {
      airbag_13Hz_v2_DW.mode = 2.0F;
      airbag_13Hz_v2_DW.elapsed_time = 0.0F;
    }
    break;

   case 4:
    for (rtb_massageEnable = 0; rtb_massageEnable < 24; rtb_massageEnable++) {
      idx = (rtb_massageEnable << 1) + 1;
      airbag_13Hz_v2_Y.frame1[idx] = (real32_T)rtb_massageEnable + 1.0F;
      airbag_13Hz_v2_Y.frame1[idx + 1] = 4.0F;
    }

    airbag_13Hz_v2_DW.elapsed_time++;
    if (airbag_13Hz_v2_DW.elapsed_time >= airbag_13Hz_v2_Y.deflation_time_out1 *
        rtb_cushionSum_a) {
      airbag_13Hz_v2_DW.mode = 0.0F;
      airbag_13Hz_v2_DW.elapsed_time = 0.0F;
    }
    break;

   default:
    airbag_13Hz_v2_DW.mode = 0.0F;
    airbag_13Hz_v2_DW.elapsed_time = 0.0F;
    for (rtb_massageEnable = 0; rtb_massageEnable < 24; rtb_massageEnable++) {
      idx = (rtb_massageEnable << 1) + 1;
      airbag_13Hz_v2_Y.frame1[idx] = (real32_T)rtb_massageEnable + 1.0F;
      airbag_13Hz_v2_Y.frame1[idx + 1] = 0.0F;
    }
    break;
  }

  newReason = (living && ((airbag_13Hz_v2_DW.mode == 2.0F) ||
    (airbag_13Hz_v2_DW.mode == 3.0F)));
  if (newReason) {
    if (rtb_action != 0) {
      airbag_13Hz_v2_Y.frame1[8] = (real32_T)rtb_action;
    }

    if (rtb_leftAction_h != 0) {
      airbag_13Hz_v2_Y.frame1[6] = (real32_T)rtb_leftAction_h;
    }
  }

  if ((airbag_13Hz_v2_DW.pRequest[0] > 0.5F) && newReason) {
    if (airbag_13Hz_v2_DW.pRequest[2] > 0.0F) {
      rtb_massageEnable = 3;
    } else {
      rtb_massageEnable = 4;
    }

    for (rtb_action = 0; rtb_action < 10; rtb_action++) {
      if (deflationSeconds == 1.0F) {
        newReason = ((rtb_action == 0) || (rtb_action + 1 == 2));
      } else if (deflationSeconds == 2.0F) {
        newReason = ((rtb_action + 1 == 3) || (rtb_action + 1 == 4));
      } else if (deflationSeconds == 3.0F) {
        newReason = ((rtb_action + 1 == 5) || (rtb_action + 1 == 6));
      } else if (deflationSeconds == 4.0F) {
        newReason = ((rtb_action + 1 == 7) || (rtb_action + 1 == 8));
      } else {
        newReason = ((deflationSeconds == 5.0F) && ((rtb_action + 1 == 9) ||
          (rtb_action + 1 == 10)));
      }

      if ((deflationSeconds == 0.0F) || newReason) {
        airbag_13Hz_v2_Y.frame1[(rtb_action << 1) + 2] = (real32_T)
          rtb_massageEnable;
      }
    }
  }

  if (rtb_isOccupied && (airbag_13Hz_v2_DW.mode != 1.0F) &&
      (airbag_13Hz_v2_DW.mode != 4.0F)) {
    for (rtb_massageEnable = 0; rtb_massageEnable < 10; rtb_massageEnable++) {
      airbag_13Hz_v2_Y.frame1[(rtb_massageEnable << 1) + 2] = 0.0F;
    }
  }

  for (rtb_massageEnable = 0; rtb_massageEnable < 14; rtb_massageEnable++) {
    rtb_action = ((rtb_massageEnable + 10) << 1) + 2;
    switch (rtb_massageGears[rtb_massageEnable]) {
     case 4:
      airbag_13Hz_v2_Y.frame1[rtb_action] = 4.0F;
      break;

     case 3:
      if (rtb_isOccupied && airbag_13Hz_v2_DW.unlocked &&
          (airbag_13Hz_v2_DW.mode != 1.0F)) {
        airbag_13Hz_v2_Y.frame1[rtb_action] = 3.0F;
      }
      break;
    }
  }

  airbag_13Hz_v2_Y.frame1[49] = 0.0F;
  airbag_13Hz_v2_Y.frame1[50] = 0.0F;
  airbag_13Hz_v2_Y.frame1[51] = 170.0F;
  airbag_13Hz_v2_Y.frame1[52] = 85.0F;
  airbag_13Hz_v2_Y.frame1[53] = 3.0F;
  airbag_13Hz_v2_Y.frame1[54] = 153.0F;
  airbag_13Hz_v2_DW.pPrevReasonCode = rtb_reasonCode;

  /* MATLAB Function: '<Root>/断电保存品味数据 1' incorporates:
   *  MATLAB Function: '<Root>/品味系数1'
   *  UnitDelay: '<Root>/Unit Delay2'
   */
  if (rtb_nvmWrite[0] == 1.0F) {
    airbag_13Hz_v2_DW.UnitDelay2_DSTATE[0] = 1.0F;
    for (i = 0; i < 14; i++) {
      airbag_13Hz_v2_DW.UnitDelay2_DSTATE[i + 1] = rtb_nvmWrite[i + 1];
    }
  } else if (rtb_nvmWrite[0] == 2.0F) {
    /* Update for UnitDelay: '<Root>/Unit Delay2' */
    for (i = 0; i < 15; i++) {
      airbag_13Hz_v2_DW.UnitDelay2_DSTATE[i] = 0.0F;
    }
  } else if (rtb_nvmWrite[0] == 3.0F) {
    airbag_13Hz_v2_DW.UnitDelay2_DSTATE[14] = (real32_T)
      (airbag_13Hz_v2_DW.pAdaptiveOff > 0.5F);
  }

  /* End of MATLAB Function: '<Root>/断电保存品味数据 1' */

  /* Outport: '<Root>/healthReasonCode1' incorporates:
   *  MATLAB Function: '<Root>/健康干预控制1'
   */
  airbag_13Hz_v2_Y.healthReasonCode1 = (real32_T)newWriteIndex;

  /* Outport: '<Root>/thresholdPassed1' incorporates:
   *  MATLAB Function: '<Root>/腰托气囊控制逻辑1'
   */
  airbag_13Hz_v2_Y.thresholdPassed1 = (real32_T)nvmCmd;

  /* Outport: '<Root>/backTotalThreshold_out1' incorporates:
   *  Inport: '<Root>/backTotalThreshold1'
   */
  airbag_13Hz_v2_Y.backTotalThreshold_out1 =
    airbag_13Hz_v2_U.backTotalThreshold1;

  /* Outport: '<Root>/reasonCode1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion25'
   *  MATLAB Function: '<Root>/品味系数1'
   */
  airbag_13Hz_v2_Y.reasonCode1 = rtb_reasonCode;

  /* Outport: '<Root>/isLivingRaw1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion27'
   */
  airbag_13Hz_v2_Y.isLivingRaw1 = airbag_13Hz_v2_DW.latestRaw;

  /* Outport: '<Root>/detectionTriggered1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion16'
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_v2_Y.detectionTriggered1 = isStill;

  /* Outport: '<Root>/queueLength1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion17'
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_v2_Y.queueLength1 = (real32_T)airbag_13Hz_v2_DW.livingQueueLen;

  /* Outport: '<Root>/detectorEnabled_out1' incorporates:
   *  Inport: '<Root>/detectorEnabled1'
   */
  airbag_13Hz_v2_Y.detectorEnabled_out1 = airbag_13Hz_v2_U.detectorEnabled1;

  /* Outport: '<Root>/isLiving1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_v2_Y.isLiving1 = (real32_T)(pState == 3);

  /* Outport: '<Root>/isStatic1' incorporates:
   *  MATLAB Function: '<Root>/活体检测1'
   */
  airbag_13Hz_v2_Y.isStatic1 = (real32_T)(pState == 2);

  /* Outport: '<Root>/isFullSeat1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion21'
   *  MATLAB Function: '<Root>/入座处理1'
   */
  airbag_13Hz_v2_Y.isFullSeat1 = (real32_T)(airbag_13Hz_v2_DW.pState_i == 2);

  /* Outport: '<Root>/offCounter1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion22'
   *  MATLAB Function: '<Root>/入座处理1'
   */
  airbag_13Hz_v2_Y.offCounter1 = (real32_T)airbag_13Hz_v2_DW.pOffCounter;

  /* Outport: '<Root>/resetCounter1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion23'
   *  MATLAB Function: '<Root>/入座处理1'
   */
  airbag_13Hz_v2_Y.resetCounter1 = (real32_T)airbag_13Hz_v2_DW.pResetCounter;

  /* Outport: '<Root>/backrestLostCounter1' incorporates:
   *  DataTypeConversion: '<Root>/Data Type Conversion24'
   *  MATLAB Function: '<Root>/入座处理1'
   */
  airbag_13Hz_v2_Y.backrestLostCounter1 = (real32_T)
    airbag_13Hz_v2_DW.pBackrestLostCounter;

  /* Outport: '<Root>/frame_data_out1' incorporates:
   *  Inport: '<Root>/frame_data1'
   */
  memcpy(&airbag_13Hz_v2_Y.frame_data_out1[0], &airbag_13Hz_v2_U.frame_data1[0],
         92U * sizeof(real32_T));

  /* Update for UnitDelay: '<Root>/Unit Delay3' incorporates:
   *  MATLAB Function: '<Root>/侧翼状态判定1'
   *  MATLAB Function: '<Root>/腰托气囊控制逻辑1'
   *  MATLAB Function: '<Root>/腿托气囊控制逻辑1'
   */
  airbag_13Hz_v2_DW.UnitDelay3_DSTATE[0] = avgPrev;
  airbag_13Hz_v2_DW.UnitDelay3_DSTATE[1] = xtmp;
  airbag_13Hz_v2_DW.UnitDelay3_DSTATE[2] = adjustCmd;
  airbag_13Hz_v2_DW.UnitDelay3_DSTATE[3] = baseInflationSeconds;
}

/* Model initialize function */
void airbag_13Hz_v2_initialize(void)
{
  {
    int32_T i;
    static const real32_T tmp[8] = { 1.5F, 0.7F, 0.7F, 1.3F, 0.48F, 0.7F, 0.64F,
      0.96F };

    /* SystemInitialize for MATLAB Function: '<Root>/品味系数1' */
    for (i = 0; i < 8; i++) {
      airbag_13Hz_v2_DW.pThresholds[i] = tmp[i];
    }

    /* End of SystemInitialize for MATLAB Function: '<Root>/品味系数1' */
  }
}

/* Model terminate function */
void airbag_13Hz_v2_terminate(void)
{
  /* (no terminate code required) */
}

/*
 * File trailer for generated code.
 *
 * [EOF]
 */
