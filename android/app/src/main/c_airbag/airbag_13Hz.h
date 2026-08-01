/*
 * Academic License - for use in teaching, academic research, and meeting
 * course requirements at degree granting institutions only.  Not for
 * government, commercial, or other organizational use.
 *
 * File: airbag_13Hz.h
 *
 * Code generated for Simulink model 'airbag_13Hz'.
 *
 * Model version                  : 1.234
 * Simulink Coder version         : 25.2 (R2025b) 28-Jul-2025
 * C/C++ source code generated on : Sat Aug  1 12:04:35 2026
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
  real_T sadCount;                     /* '<Root>/活体检测1' */
  real_T frameCount;                   /* '<Root>/活体检测1' */
  real_T livingQueueLen;               /* '<Root>/活体检测1' */
  real32_T UnitDelay3_DSTATE[4];       /* '<Root>/Unit Delay3' */
  real32_T UnitDelay2_DSTATE[15];      /* '<Root>/Unit Delay2' */
  real32_T pBaseB[56];                 /* '<Root>/矩阵处理1' */
  real32_T pBaseC[48];                 /* '<Root>/矩阵处理1' */
  real32_T pPrevB[56];                 /* '<Root>/矩阵处理1' */
  real32_T pPrevC[48];                 /* '<Root>/矩阵处理1' */
  real32_T pStable;                    /* '<Root>/矩阵处理1' */
  real32_T pDone;                      /* '<Root>/矩阵处理1' */
  real32_T prevCushion[48];            /* '<Root>/活体检测1' */
  real32_T prevBackrest[56];           /* '<Root>/活体检测1' */
  real32_T sadHistCushion[13];         /* '<Root>/活体检测1' */
  real32_T sadHistBackrest[13];        /* '<Root>/活体检测1' */
  real32_T latestConfidence;           /* '<Root>/活体检测1' */
  real32_T noiseBaseline;              /* '<Root>/活体检测1' */
  real32_T noiseDev;                   /* '<Root>/活体检测1' */
  real32_T noiseWarmCount;             /* '<Root>/活体检测1' */
  real32_T sessionFrames;              /* '<Root>/活体检测1' */
  real32_T staticStreak;               /* '<Root>/活体检测1' */
  real32_T mode;                       /* '<Root>/气囊控制协议1' */
  real32_T elapsed_time;               /* '<Root>/气囊控制协议1' */
  real32_T pPrevReasonCode;            /* '<Root>/气囊控制协议1' */
  real32_T pState;                     /* '<Root>/品味系数1' */
  real32_T pValid;                     /* '<Root>/品味系数1' */
  real32_T pSavedTimes[5];             /* '<Root>/品味系数1' */
  real32_T pEditTimes[5];              /* '<Root>/品味系数1' */
  real32_T pThresholds[8];             /* '<Root>/品味系数1' */
  real32_T pRequest[5];                /* '<Root>/品味系数1' */
  real32_T pSeatHandled;               /* '<Root>/品味系数1' */
  real32_T pPending[3];                /* '<Root>/品味系数1' */
  real32_T pPrevFrontCmd[3];           /* '<Root>/品味系数1' */
  real32_T pPrevNvmValid;              /* '<Root>/品味系数1' */
  real32_T pPrevReasonCode_j;          /* '<Root>/品味系数1' */
  real32_T pPrevOccupied;              /* '<Root>/品味系数1' */
  real32_T pBaseElapsed;               /* '<Root>/品味系数1' */
  real32_T pBaseReady;                 /* '<Root>/品味系数1' */
  real32_T pRequestElapsed;            /* '<Root>/品味系数1' */
  real32_T pAdaptiveOff;               /* '<Root>/品味系数1' */
  real32_T pEntryDeflate;              /* '<Root>/品味系数1' */
  real32_T pCopBufX[125];              /* '<Root>/健康检测1' */
  real32_T pCopBufY[125];              /* '<Root>/健康检测1' */
  real32_T pPeakPressure;              /* '<Root>/健康检测1' */
  real32_T pSumX;                      /* '<Root>/健康检测1' */
  real32_T pSumY;                      /* '<Root>/健康检测1' */
  real32_T pSumX2;                     /* '<Root>/健康检测1' */
  real32_T pSumY2;                     /* '<Root>/健康检测1' */
  real32_T pPathLength;                /* '<Root>/健康检测1' */
  real32_T pPathCompensation;          /* '<Root>/健康检测1' */
  real32_T pSpineBiasSec;              /* '<Root>/健康干预控制1' */
  real32_T pSpineDir;                  /* '<Root>/健康干预控制1' */
  real32_T pSpineActive;               /* '<Root>/健康干预控制1' */
  real32_T pSpineNeutralSec;           /* '<Root>/健康干预控制1' */
  real32_T pSpineActionTimer;          /* '<Root>/健康干预控制1' */
  real32_T pBumpDetectSec;             /* '<Root>/健康干预控制1' */
  real32_T pBumpClearSec;              /* '<Root>/健康干预控制1' */
  real32_T pBumpLatched;               /* '<Root>/健康干预控制1' */
  real32_T pBumpActionTimer;           /* '<Root>/健康干预控制1' */
  real32_T pHistoryValid;              /* '<Root>/健康干预控制1' */
  real32_T pForwardRefX;               /* '<Root>/健康干预控制1' */
  real32_T pForwardAge;                /* '<Root>/健康干预控制1' */
  real32_T pBackDropWindow;            /* '<Root>/健康干预控制1' */
  real32_T pSickPromptTimer;           /* '<Root>/健康干预控制1' */
  real32_T pBackPeakSum;               /* '<Root>/健康干预控制1' */
  real32_T pBackPeakAge;               /* '<Root>/健康干预控制1' */
  real32_T pSickEventCount;            /* '<Root>/健康干预控制1' */
  real32_T pSickEventGap;              /* '<Root>/健康干预控制1' */
  real32_T pSickCountAge;              /* '<Root>/健康干预控制1' */
  int32_T pReplayIndex;                /* '<Root>/品味系数1' */
  int32_T pGapCycles;                  /* '<Root>/品味系数1' */
  int32_T pOffCounter;                 /* '<Root>/入座处理1' */
  int32_T pResetCounter;               /* '<Root>/入座处理1' */
  int32_T pBackrestLostCounter;        /* '<Root>/入座处理1' */
  int32_T pBufLen;                     /* '<Root>/健康检测1' */
  int32_T pWriteIndex;                 /* '<Root>/健康检测1' */
  int32_T pFrameCount;                 /* '<Root>/健康检测1' */
  uint32_T sitFrameCount;              /* '<Root>/久坐按摩1' */
  uint32_T massageFrameCount;          /* '<Root>/久坐按摩1' */
  uint32_T hipCycleCount;              /* '<Root>/久坐按摩1' */
  uint32_T hipInflateCount;            /* '<Root>/久坐按摩1' */
  int8_T pState_i;                     /* '<Root>/入座处理1' */
  uint8_T phase;                       /* '<Root>/久坐按摩1' */
  boolean_T frameCount_not_empty;      /* '<Root>/活体检测1' */
  boolean_T livingQueue[3];            /* '<Root>/活体检测1' */
  boolean_T latestRaw;                 /* '<Root>/活体检测1' */
  boolean_T unlocked;                  /* '<Root>/活体检测1' */
  boolean_T sessionLivingLatched;      /* '<Root>/活体检测1' */
  boolean_T pState_not_empty;          /* '<Root>/入座处理1' */
  boolean_T phase_not_empty;           /* '<Root>/久坐按摩1' */
  boolean_T livingLatched;             /* '<Root>/久坐按摩1' */
  boolean_T prevOccupied;              /* '<Root>/久坐按摩1' */
  boolean_T prevManualCmd;             /* '<Root>/久坐按摩1' */
  boolean_T hipInflating;              /* '<Root>/久坐按摩1' */
} DW_airbag_13Hz_T;

/* External inputs (root inport signals with default storage) */
typedef struct {
  real32_T frame_data1[92];            /* '<Root>/frame_data1' */
  real32_T backTotalThreshold1;        /* '<Root>/backTotalThreshold1' */
  boolean_T resetFlag1;                /* '<Root>/resetFlag1' */
  real32_T detectorEnabled1;           /* '<Root>/detectorEnabled1' */
  real32_T inflation_time2;            /* '<Root>/inflation_time2' */
  real32_T inflation_time3;            /* '<Root>/inflation_time3' */
  real32_T holding_time1;              /* '<Root>/holding_time1' */
  real32_T deflation_time1;            /* '<Root>/deflation_time1' */
  real32_T adoption_frequency1;        /* '<Root>/adoption_frequency1' */
  real32_T cushionThreshold1;          /* '<Root>/ cushionThreshold1' */
  real32_T backrestThreshold1;         /* '<Root>/backrestThreshold1' */
  real32_T leftInflateThreshold1;      /* '<Root>/leftInflateThreshold1' */
  real32_T leftDeflateThreshold1;      /* '<Root>/leftDeflateThreshold1' */
  real32_T rightInflateThreshold1;     /* '<Root>/rightInflateThreshold1' */
  real32_T rightDeflateThreshold1;     /* '<Root>/rightDeflateThreshold1' */
  real32_T ratioInflateLeft1;          /* '<Root>/ratioInflateLeft1' */
  real32_T ratioDeflateLeft1;          /* '<Root>/ratioDeflateLeft1' */
  real32_T ratioInflate1;              /* '<Root>/ratioInflate1' */
  real32_T ratioDeflate1;              /* '<Root>/ratioDeflate1' */
  real32_T longSitMassageStop1;        /* '<Root>/longSitMassageStop1' */
  real32_T frontCmd1[3];               /* '<Root>/frontCmd1' */
  real32_T sadThresholdIn1;            /* '<Root>/sadThresholdIn1' */
  real32_T sadNormalizeScaleIn1;       /* '<Root>/sadNormalizeScaleIn1' */
  real32_T livingConfirmCountIn1;      /* '<Root>/livingConfirmCountIn1' */
  real32_T spineBiasDeadband1;         /* '<Root>/ spineBiasDeadband1' */
  real32_T sickForwardMinMm1;          /* '<Root>/ sickForwardMinMm1' */
  real32_T sickBackDropRatio1;         /* '<Root>/ sickBackDropRatio1' */
  real32_T sickPairWindowSec1;         /* '<Root>/ sickPairWindowSec1' */
  real32_T bumpMinVelocity1;           /* '<Root>/ bumpMinVelocity1' */
  real32_T bumpMaxRms1;                /* '<Root>/ bumpMaxRms1' */
  real32_T bumpMaxRangeMm1;            /* '<Root>/ bumpMaxRangeMm1' */
  real32_T manualMassageOn1;           /* '<Root>/manualMassageOn1' */
  real32_T sitThresholdmin1;           /* '<Root>/sitThresholdmin1' */
  real32_T welcomeSideWingTime1;       /* '<Root>/welcomeSideWingTime1' */
  real32_T welcomeLegTime1;            /* '<Root>/welcomeLegTime1' */
  real32_T welcomeLumbarTime1;         /* '<Root>/welcomeLumbarTime1' */
  real32_T welcomeHipTime1;            /* '<Root>/welcomeHipTime1' */
  real32_T cushionForwardSign1;        /* '<Root>/ cushionForwardSign1' */
  real32_T bumpTimeThresholdSec1;      /* '<Root>/ bumpTimeThresholdSec1' */
  real32_T spineTimeThresholdSec1;     /* '<Root>/ spineTimeThresholdSec1' */
  real32_T pointThreshold1;            /* '<Root>/pointThreshold1' */
  real32_T childCushionThresholdIn;    /* '<Root>/childCushionThresholdIn' */
} ExtU_airbag_13Hz_T;

/* External outputs (root outports fed by signals with default storage) */
typedef struct {
  real32_T cushionData1[48];           /* '<Root>/cushionData1' */
  real32_T backrestData1[56];          /* '<Root>/backrestData1' */
  real32_T leftPressure1;              /* '<Root>/leftPressure1' */
  real32_T rightPressure1;             /* '<Root>/rightPressure1' */
  real32_T backMeanTotal_wing1;        /* '<Root>/backMeanTotal_wing1' */
  real32_T ratioInflateLeft_out1;      /* '<Root>/ratioInflateLeft_out1' */
  real32_T ratioDeflateLeft_out1;      /* '<Root>/ratioDeflateLeft_out1' */
  real32_T backTotalThreshold_out1;    /* '<Root>/backTotalThreshold_out1' */
  real32_T upperMean1;                 /* '<Root>/upperMean1' */
  real32_T lowerMean1;                 /* '<Root>/lowerMean1' */
  real32_T backMeanTotal_lumbar1;      /* '<Root>/backMeanTotal_lumbar1' */
  real32_T thresholdPassed1;           /* '<Root>/thresholdPassed1' */
  real32_T ratioInflate_out1;          /* '<Root>/ratioInflate_out1' */
  real32_T ratioDeflate_out1;          /* '<Root>/ratioDeflate_out1' */
  real32_T leftButtMean1;              /* '<Root>/leftButtMean1' */
  real32_T leftLegMean1;               /* '<Root>/leftLegMean1' */
  real32_T rightButtMean1;             /* '<Root>/rightButtMean1' */
  real32_T rightLegMean1;              /* '<Root>/rightLegMean1' */
  real32_T leftInflateThreshold_out1;  /* '<Root>/leftInflateThreshold_out1' */
  real32_T leftDeflateThreshold_out1;  /* '<Root>/leftDeflateThreshold_out1' */
  real32_T rightInflateThreshold_out1; /* '<Root>/rightInflateThreshold_out1' */
  real32_T rightDeflateThreshold_out1; /* '<Root>/rightDeflateThreshold_out1' */
  real32_T isFullSeat1;                /* '<Root>/isFullSeat1' */
  real32_T cushionSum1;                /* '<Root>/cushionSum1' */
  real32_T backrestSum1;               /* '<Root>/backrestSum1' */
  real32_T offCounter1;                /* '<Root>/offCounter1' */
  real32_T resetCounter1;              /* '<Root>/resetCounter1' */
  real32_T backrestLostCounter1;       /* '<Root>/backrestLostCounter1' */
  real32_T reasonCode1;                /* '<Root>/reasonCode1' */
  real32_T isLivingRaw1;               /* '<Root>/isLivingRaw1' */
  real32_T confidence1;                /* '<Root>/confidence1' */
  real32_T sadEnergy1;                 /* '<Root>/sadEnergy1' */
  real32_T sadCushion1;                /* '<Root>/sadCushion1' */
  real32_T sadBackrest1;               /* '<Root>/sadBackrest1' */
  real32_T sadScore1;                  /* '<Root>/sadScore1' */
  real32_T detectionTriggered1;        /* '<Root>/detectionTriggered1' */
  real32_T queueLength1;               /* '<Root>/queueLength1' */
  real32_T frame1[55];                 /* '<Root>/frame1' */
  real32_T detectorEnabled_out1;       /* '<Root>/detectorEnabled_out1' */
  real32_T frame_data_out1[92];        /* '<Root>/frame_data_out1' */
  real32_T inflation_time_out1;        /* '<Root>/inflation_time_out1' */
  real32_T inflation_time1_out1;       /* '<Root>/inflation_time1_out1' */
  real32_T holding_time_out1;          /* '<Root>/holding_time_out1' */
  real32_T deflation_time_out1;        /* '<Root>/deflation_time_out1' */
  real32_T longSitMinutes1;            /* '<Root>/longSitMinutes1' */
  real32_T longSitMassageActive1;      /* '<Root>/longSitMassageActive1' */
  real32_T longSitCycleRemain1;        /* '<Root>/longSitCycleRemain1' */
  real32_T longSitPrompt1;             /* '<Root>/longSitPrompt1' */
  real32_T spineProtectActive1;        /* '<Root>/spineProtectActive1' */
  real32_T spineProtectSide1;          /* '<Root>/spineProtectSide1' */
  real32_T bumpReliefActive1;          /* '<Root>/bumpReliefActive1' */
  real32_T motionSicknessActive1;      /* '<Root>/motionSicknessActive1' */
  real32_T healthReasonCode1;          /* '<Root>/healthReasonCode1' */
  real32_T spineBiasSeconds1;          /* '<Root>/spineBiasSeconds1' */
  real32_T bumpDetectSeconds1;         /* '<Root>/bumpDetectSeconds1' */
  real32_T cushionForwardMoveMm1;      /* '<Root>/cushionForwardMoveMm1' */
  real32_T backrestDropRatio1;         /* '<Root>/backrestDropRatio1' */
  real32_T sickEventCount1;            /* '<Root>/sickEventCount1' */
  real32_T isLiving1;                  /* '<Root>/isLiving1' */
  real32_T isStatic1;                  /* '<Root>/isStatic1' */
  real32_T isChild;                    /* '<Root>/isChild' */
  real32_T isAdult;                    /* '<Root>/isAdult' */
  real32_T childThreshold_out;         /* '<Root>/childThreshold_out' */
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
 * Block '<Root>/Data Type Conversion14' : Eliminate redundant data type conversion
 * Block '<Root>/Data Type Conversion16' : Eliminate redundant data type conversion
 * Block '<Root>/Data Type Conversion17' : Eliminate redundant data type conversion
 * Block '<Root>/Data Type Conversion18' : Eliminate redundant data type conversion
 * Block '<Root>/Data Type Conversion19' : Eliminate redundant data type conversion
 * Block '<Root>/Data Type Conversion27' : Eliminate redundant data type conversion
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
 * '<S1>'   : 'airbag_13Hz/久坐按摩1'
 * '<S2>'   : 'airbag_13Hz/侧翼状态判定1'
 * '<S3>'   : 'airbag_13Hz/健康干预控制1'
 * '<S4>'   : 'airbag_13Hz/健康检测1'
 * '<S5>'   : 'airbag_13Hz/入座处理1'
 * '<S6>'   : 'airbag_13Hz/品味系数1'
 * '<S7>'   : 'airbag_13Hz/断电保存品味数据 1'
 * '<S8>'   : 'airbag_13Hz/气囊控制协议1'
 * '<S9>'   : 'airbag_13Hz/活体检测1'
 * '<S10>'  : 'airbag_13Hz/矩阵处理1'
 * '<S11>'  : 'airbag_13Hz/腰托气囊控制逻辑1'
 * '<S12>'  : 'airbag_13Hz/腿托气囊控制逻辑1'
 */
#endif                                 /* airbag_13Hz_h_ */

/*
 * File trailer for generated code.
 *
 * [EOF]
 */
