/*
 * Academic License - for use in teaching, academic research, and meeting
 * course requirements at degree granting institutions only.  Not for
 * government, commercial, or other organizational use.
 *
 * File: airbag_13Hz.h
 *
 * Code generated for Simulink model 'airbag_13Hz'.
 *
 * Model version                  : 1.210
 * Simulink Coder version         : 25.2 (R2025b) 28-Jul-2025
 * C/C++ source code generated on : Wed Jul 22 16:13:02 2026
 *
 * Target selection: ert.tlc
 * Embedded hardware selection: NXP->Cortex-M4
 * Code generation objectives: Unspecified
 * Validation result: Not run
 */

#ifndef airbag_13Hz_h_
#define airbag_13Hz_h_
#ifndef airbag_13Hz_COMMON_INCLUDES_
#define airbag_13Hz_COMMON_INCLUDES_
#include "rtwtypes.h"
#include "rt_nonfinite.h"
#include "math.h"
#endif                                 /* airbag_13Hz_COMMON_INCLUDES_ */

#include "airbag_13Hz_types.h"
#include "rtGetNaN.h"

/* Macros for accessing real-time model data structure */
#ifndef rtmGetErrorStatus
#define rtmGetErrorStatus(rtm)         ((rtm)->errorStatus)
#endif

#ifndef rtmSetErrorStatus
#define rtmSetErrorStatus(rtm, val)    ((rtm)->errorStatus = (val))
#endif

/* Block states (default storage) for system '<Root>' */
typedef struct {
  real_T sadCount;                     /* '<Root>/活体检测' */
  real_T frameCount;                   /* '<Root>/活体检测' */
  real_T livingQueueLen;               /* '<Root>/活体检测' */
  real32_T UnitDelay1_DSTATE[4];       /* '<Root>/Unit Delay1' */
  real32_T UnitDelay_DSTATE[15];       /* '<Root>/Unit Delay' */
  real32_T prevCushion[48];            /* '<Root>/活体检测' */
  real32_T prevBackrest[56];           /* '<Root>/活体检测' */
  real32_T sadHistCushion[13];         /* '<Root>/活体检测' */
  real32_T sadHistBackrest[13];        /* '<Root>/活体检测' */
  real32_T latestConfidence;           /* '<Root>/活体检测' */
  real32_T mode;                       /* '<Root>/气囊控制协议' */
  real32_T elapsed_time;               /* '<Root>/气囊控制协议' */
  real32_T pPrevReasonCode;            /* '<Root>/气囊控制协议' */
  real32_T pState;                     /* '<Root>/品味系数' */
  real32_T pValid;                     /* '<Root>/品味系数' */
  real32_T pSavedTimes[5];             /* '<Root>/品味系数' */
  real32_T pEditTimes[5];              /* '<Root>/品味系数' */
  real32_T pThresholds[8];             /* '<Root>/品味系数' */
  real32_T pRequest[5];                /* '<Root>/品味系数' */
  real32_T pSeatHandled;               /* '<Root>/品味系数' */
  real32_T pPending[3];                /* '<Root>/品味系数' */
  real32_T pPrevFrontCmd[3];           /* '<Root>/品味系数' */
  real32_T pPrevNvmValid;              /* '<Root>/品味系数' */
  real32_T pPrevReasonCode_a;          /* '<Root>/品味系数' */
  real32_T pPrevOccupied;              /* '<Root>/品味系数' */
  real32_T pBaseElapsed;               /* '<Root>/品味系数' */
  real32_T pBaseReady;                 /* '<Root>/品味系数' */
  real32_T pRequestElapsed;            /* '<Root>/品味系数' */
  real32_T pAdaptiveOff;               /* '<Root>/品味系数' */
  real32_T pCopBufX[125];              /* '<Root>/健康检测' */
  real32_T pCopBufY[125];              /* '<Root>/健康检测' */
  real32_T pPeakPressure;              /* '<Root>/健康检测' */
  real32_T pSumX;                      /* '<Root>/健康检测' */
  real32_T pSumY;                      /* '<Root>/健康检测' */
  real32_T pSumX2;                     /* '<Root>/健康检测' */
  real32_T pSumY2;                     /* '<Root>/健康检测' */
  real32_T pPathLength;                /* '<Root>/健康检测' */
  real32_T pPathCompensation;          /* '<Root>/健康检测' */
  real32_T pSpineBiasSec;              /* '<Root>/健康干预控制' */
  real32_T pSpineDir;                  /* '<Root>/健康干预控制' */
  real32_T pSpineActive;               /* '<Root>/健康干预控制' */
  real32_T pSpineNeutralSec;           /* '<Root>/健康干预控制' */
  real32_T pSpineActionTimer;          /* '<Root>/健康干预控制' */
  real32_T pBumpDetectSec;             /* '<Root>/健康干预控制' */
  real32_T pBumpClearSec;              /* '<Root>/健康干预控制' */
  real32_T pBumpLatched;               /* '<Root>/健康干预控制' */
  real32_T pBumpActionTimer;           /* '<Root>/健康干预控制' */
  real32_T pHistoryValid;              /* '<Root>/健康干预控制' */
  real32_T pPrevBackrestSum;           /* '<Root>/健康干预控制' */
  real32_T pForwardRefX;               /* '<Root>/健康干预控制' */
  real32_T pForwardAge;                /* '<Root>/健康干预控制' */
  real32_T pBackDropWindow;            /* '<Root>/健康干预控制' */
  real32_T pSickPromptTimer;           /* '<Root>/健康干预控制' */
  int32_T pReplayIndex;                /* '<Root>/品味系数' */
  int32_T pGapCycles;                  /* '<Root>/品味系数' */
  int32_T pOffCounter;                 /* '<Root>/入座处理' */
  int32_T pResetCounter;               /* '<Root>/入座处理' */
  int32_T pBackrestLostCounter;        /* '<Root>/入座处理' */
  int32_T pBufLen;                     /* '<Root>/健康检测' */
  int32_T pWriteIndex;                 /* '<Root>/健康检测' */
  int32_T pFrameCount;                 /* '<Root>/健康检测' */
  uint32_T sitFrameCount;              /* '<Root>/久坐按摩' */
  uint32_T massageFrameCount;          /* '<Root>/久坐按摩' */
  int8_T pState_g;                     /* '<Root>/入座处理' */
  uint8_T phase;                       /* '<Root>/久坐按摩' */
  boolean_T frameCount_not_empty;      /* '<Root>/活体检测' */
  boolean_T livingQueue[3];            /* '<Root>/活体检测' */
  boolean_T latestRaw;                 /* '<Root>/活体检测' */
  boolean_T unlocked;                  /* '<Root>/活体检测' */
  boolean_T pState_not_empty;          /* '<Root>/入座处理' */
  boolean_T phase_not_empty;           /* '<Root>/久坐按摩' */
  boolean_T livingLatched;             /* '<Root>/久坐按摩' */
  boolean_T prevOccupied;              /* '<Root>/久坐按摩' */
} DW_airbag_13Hz_T;

/* External inputs (root inport signals with default storage) */
typedef struct {
  real32_T frame_data[92];             /* '<Root>/frame_data' */
  real32_T backTotalThreshold;         /* '<Root>/backTotalThreshold' */
  boolean_T resetFlag;                 /* '<Root>/resetFlag' */
  real32_T detectorEnabled;            /* '<Root>/detectorEnabled' */
  real32_T inflation_time;             /* '<Root>/inflation_time' */
  real32_T inflation_time1;            /* '<Root>/inflation_time1' */
  real32_T holding_time;               /* '<Root>/holding_time' */
  real32_T deflation_time;             /* '<Root>/deflation_time' */
  real32_T adoption_frequency;         /* '<Root>/adoption_frequency' */
  real32_T cushionThreshold;           /* '<Root>/ cushionThreshold' */
  real32_T backrestThreshold;          /* '<Root>/backrestThreshold' */
  real32_T leftInflateThreshold;       /* '<Root>/leftInflateThreshold' */
  real32_T leftDeflateThreshold;       /* '<Root>/leftDeflateThreshold' */
  real32_T rightInflateThreshold;      /* '<Root>/rightInflateThreshold' */
  real32_T rightDeflateThreshold;      /* '<Root>/rightDeflateThreshold' */
  real32_T ratioInflateLeft;           /* '<Root>/ratioInflateLeft' */
  real32_T ratioDeflateLeft;           /* '<Root>/ratioDeflateLeft' */
  real32_T ratioInflate;               /* '<Root>/ratioInflate' */
  real32_T ratioDeflate;               /* '<Root>/ratioDeflate' */
  real32_T longSitMassageStop;         /* '<Root>/longSitMassageStop' */
  real32_T frontCmd[3];                /* '<Root>/frontCmd' */
  real32_T sadThreshold;               /* '<Root>/sadThreshold' */
  real32_T sadNormalizeScale;          /* '<Root>/sadNormalizeScale' */
  real32_T livingConfirmCount;         /* '<Root>/livingConfirmCount' */
} ExtU_airbag_13Hz_T;

/* External outputs (root outports fed by signals with default storage) */
typedef struct {
  real32_T cushionData[48];            /* '<Root>/cushionData' */
  real32_T backrestData[56];           /* '<Root>/backrestData' */
  real32_T leftPressure;               /* '<Root>/leftPressure' */
  real32_T rightPressure;              /* '<Root>/rightPressure' */
  real32_T backMeanTotal_wing;         /* '<Root>/backMeanTotal_wing' */
  real32_T ratioInflateLeft_out;       /* '<Root>/ratioInflateLeft_out' */
  real32_T ratioDeflateLeft_out;       /* '<Root>/ratioDeflateLeft_out' */
  real32_T backTotalThreshold_out;     /* '<Root>/backTotalThreshold_out' */
  real32_T upperMean;                  /* '<Root>/upperMean' */
  real32_T lowerMean;                  /* '<Root>/lowerMean' */
  real32_T backMeanTotal_lumbar;       /* '<Root>/backMeanTotal_lumbar' */
  real32_T thresholdPassed;            /* '<Root>/thresholdPassed' */
  real32_T ratioInflate_out;           /* '<Root>/ratioInflate_out' */
  real32_T ratioDeflate_out;           /* '<Root>/ratioDeflate_out' */
  real32_T leftButtMean;               /* '<Root>/leftButtMean' */
  real32_T leftLegMean;                /* '<Root>/leftLegMean' */
  real32_T rightButtMean;              /* '<Root>/rightButtMean' */
  real32_T rightLegMean;               /* '<Root>/rightLegMean' */
  real32_T leftInflateThreshold_out;   /* '<Root>/leftInflateThreshold_out' */
  real32_T leftDeflateThreshold_out;   /* '<Root>/leftDeflateThreshold_out' */
  real32_T rightInflateThreshold_out;  /* '<Root>/rightInflateThreshold_out' */
  real32_T rightDeflateThreshold_out;  /* '<Root>/rightDeflateThreshold_out' */
  real32_T isFullSeat;                 /* '<Root>/isFullSeat' */
  real32_T cushionSum;                 /* '<Root>/cushionSum' */
  real32_T backrestSum;                /* '<Root>/backrestSum' */
  real32_T offCounter;                 /* '<Root>/offCounter' */
  real32_T resetCounter;               /* '<Root>/resetCounter' */
  real32_T backrestLostCounter;        /* '<Root>/backrestLostCounter' */
  real32_T reasonCode;                 /* '<Root>/reasonCode' */
  real32_T isLivingRaw;                /* '<Root>/isLivingRaw' */
  real32_T confidence;                 /* '<Root>/confidence' */
  real32_T sadEnergy;                  /* '<Root>/sadEnergy' */
  real32_T sadCushion;                 /* '<Root>/sadCushion' */
  real32_T sadBackrest;                /* '<Root>/sadBackrest' */
  real32_T sadScore;                   /* '<Root>/sadScore' */
  real32_T detectionTriggered;         /* '<Root>/detectionTriggered' */
  real32_T queueLength;                /* '<Root>/queueLength' */
  real32_T frame[55];                  /* '<Root>/frame' */
  real32_T detectorEnabled_out;        /* '<Root>/detectorEnabled_out' */
  real32_T frame_data_out[92];         /* '<Root>/frame_data_out' */
  real32_T inflation_time_out;         /* '<Root>/inflation_time_out' */
  real32_T inflation_time1_out;        /* '<Root>/inflation_time1_out' */
  real32_T holding_time_out;           /* '<Root>/holding_time_out' */
  real32_T deflation_time_out;         /* '<Root>/deflation_time_out' */
  real32_T longSitMinutes;             /* '<Root>/longSitMinutes' */
  real32_T longSitMassageActive;       /* '<Root>/longSitMassageActive' */
  real32_T longSitCycleRemain;         /* '<Root>/longSitCycleRemain' */
  real32_T longSitPrompt;              /* '<Root>/longSitPrompt' */
  real32_T spineProtectActive;         /* '<Root>/spineProtectActive' */
  real32_T spineProtectSide;           /* '<Root>/spineProtectSide' */
  real32_T bumpReliefActive;           /* '<Root>/bumpReliefActive' */
  real32_T motionSicknessActive;       /* '<Root>/motionSicknessActive' */
  real32_T healthReasonCode;           /* '<Root>/healthReasonCode' */
  real32_T spineBiasSeconds;           /* '<Root>/spineBiasSeconds' */
  real32_T bumpDetectSeconds;          /* '<Root>/bumpDetectSeconds' */
  real32_T cushionForwardMoveMm;       /* '<Root>/cushionForwardMoveMm' */
  real32_T backrestDropRatio;          /* '<Root>/backrestDropRatio' */
} ExtY_airbag_13Hz_T;

/* Real-time Model Data Structure */
struct tag_RTM_airbag_13Hz_T {
  const char_T * volatile errorStatus;
};

/* Block states (default storage) */
extern DW_airbag_13Hz_T airbag_13Hz_DW;

/* External inputs (root inport signals with default storage) */
extern ExtU_airbag_13Hz_T airbag_13Hz_U;

/* External outputs (root outports fed by signals with default storage) */
extern ExtY_airbag_13Hz_T airbag_13Hz_Y;

/* Model entry point functions */
extern void airbag_13Hz_initialize(void);
extern void airbag_13Hz_step(void);
extern void airbag_13Hz_terminate(void);

/* Real-time Model object */
extern RT_MODEL_airbag_13Hz_T *const airbag_13Hz_M;

/*-
 * These blocks were eliminated from the model due to optimizations:
 *
 * Block '<Root>/Data Type Conversion' : Eliminate redundant data type conversion
 * Block '<Root>/Data Type Conversion13' : Eliminate redundant data type conversion
 */

/*-
 * The generated code includes comments that allow you to trace directly
 * back to the appropriate location in the model.  The basic format
 * is <system>/block_name, where system is the system number (uniquely
 * assigned by Simulink) and block_name is the name of the block.
 *
 * Use the MATLAB hilite_system command to trace the generated code back
 * to the model.  For example,
 *
 * hilite_system('<S3>')    - opens system 3
 * hilite_system('<S3>/Kp') - opens and selects block Kp which resides in S3
 *
 * Here is the system hierarchy for this model
 *
 * '<Root>' : 'airbag_13Hz'
 * '<S1>'   : 'airbag_13Hz/久坐按摩'
 * '<S2>'   : 'airbag_13Hz/侧翼状态判定'
 * '<S3>'   : 'airbag_13Hz/健康干预控制'
 * '<S4>'   : 'airbag_13Hz/健康检测'
 * '<S5>'   : 'airbag_13Hz/入座处理'
 * '<S6>'   : 'airbag_13Hz/品味系数'
 * '<S7>'   : 'airbag_13Hz/断电保存品味数据 '
 * '<S8>'   : 'airbag_13Hz/气囊控制协议'
 * '<S9>'   : 'airbag_13Hz/活体检测'
 * '<S10>'  : 'airbag_13Hz/矩阵处理'
 * '<S11>'  : 'airbag_13Hz/腰托气囊控制逻辑'
 * '<S12>'  : 'airbag_13Hz/腿托气囊控制逻辑'
 */
#endif                                 /* airbag_13Hz_h_ */

/*
 * File trailer for generated code.
 *
 * [EOF]
 */
