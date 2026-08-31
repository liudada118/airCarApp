#ifndef airbag_13Hz_h_
#define airbag_13Hz_h_
#ifndef airbag_13Hz_COMMON_INCLUDES_
#define airbag_13Hz_COMMON_INCLUDES_
#include "rtwtypes.h"
#include "rt_nonfinite.h"
#include "math.h"
#endif

#include "airbag_13Hz_types.h"
#include "rtGetNaN.h"
#ifndef rtmGetErrorStatus
#define rtmGetErrorStatus(rtm)         ((rtm)->errorStatus)
#endif

#ifndef rtmSetErrorStatus
#define rtmSetErrorStatus(rtm, val)    ((rtm)->errorStatus = (val))
#endif

typedef struct {
  real_T sadCount;
  real_T frameCount;
  real_T livingQueueLen;
  real32_T UnitDelay3_DSTATE[4];
  real32_T UnitDelay2_DSTATE[15];
  real32_T prevCushion[48];
  real32_T prevBackrest[56];
  real32_T sadHistCushion[13];
  real32_T sadHistBackrest[13];
  real32_T latestConfidence;
  real32_T noiseBaseline;
  real32_T noiseDev;
  real32_T noiseWarmCount;
  real32_T mode;
  real32_T elapsed_time;
  real32_T pPrevReasonCode;
  real32_T pPrevGears[24];
  real32_T pPrevHealthLeft;
  real32_T pPrevHealthRight;
  real32_T pState;
  real32_T pValid;
  real32_T pSavedTimes[5];
  real32_T pEditTimes[5];
  real32_T pThresholds[8];
  real32_T pRequest[5];
  real32_T pSeatHandled;
  real32_T pPending[3];
  real32_T pPrevFrontCmd[3];
  real32_T pPrevNvmValid;
  real32_T pPrevReasonCode_j;
  real32_T pPrevOccupied;
  real32_T pBaseElapsed;
  real32_T pBaseReady;
  real32_T pRequestElapsed;
  real32_T pAdaptiveOff;
  real32_T pEntryDeflate;
  real32_T pCopBufX[125];
  real32_T pCopBufY[125];
  real32_T pPeakPressure;
  real32_T pSumX;
  real32_T pSumY;
  real32_T pSumX2;
  real32_T pSumY2;
  real32_T pPathLength;
  real32_T pPathCompensation;
  real32_T pSpineBiasSec;
  real32_T pSpineDir;
  real32_T pSpineActive;
  real32_T pSpineNeutralSec;
  real32_T pSpineActionTimer;
  real32_T pBumpDetectSec;
  real32_T pBumpClearSec;
  real32_T pBumpLatched;
  real32_T pBumpActionTimer;
  real32_T pHistoryValid;
  real32_T pForwardRefX;
  real32_T pForwardAge;
  real32_T pBackDropWindow;
  real32_T pSickPromptTimer;
  real32_T pBackPeakSum;
  real32_T pBackPeakAge;
  real32_T pSickEventCount;
  real32_T pSickEventGap;
  real32_T pSickCountAge;
  real32_T pDemoSpineTimer;
  real32_T pDemoSpineSide;
  real32_T pDemoBumpTimer;
  real32_T pDemoSickTimer;
  real32_T pPrevDemoCmd[3];
  real32_T pPendingDemoMode;
  real32_T pPendingDemoArg;
  int32_T pReplayIndex;
  int32_T pGapCycles;
  int32_T pOffCounter;
  int32_T pResetCounter;
  int32_T pBackrestLostCounter;
  int32_T pBufLen;
  int32_T pWriteIndex;
  int32_T pFrameCount;
  int32_T pDemoHoldCycles;
  uint32_T sitFrameCount;
  uint32_T massageFrameCount;
  uint32_T hipCycleCount;
  uint32_T hipInflateCount;
  int8_T pState_i;
  uint8_T phase;
  boolean_T frameCount_not_empty;
  boolean_T livingQueue[2];
  boolean_T latestRaw;
  boolean_T sessionLivingLatched;
  boolean_T pState_not_empty;
  boolean_T phase_not_empty;
  boolean_T livingLatched;
  boolean_T prevOccupied;
  boolean_T prevManualCmd;
  boolean_T hipInflating;
} DW_airbag_13Hz_T;

typedef struct {
  real32_T frame_data1[92];
  real32_T backTotalThreshold1;
  boolean_T resetFlag1;
  real32_T detectorEnabled1;
  real32_T inflation_time2;
  real32_T inflation_time3;
  real32_T holding_time1;
  real32_T deflation_time1;
  real32_T adoption_frequency1;
  real32_T cushionThreshold1;
  real32_T backrestThreshold1;
  real32_T leftInflateThreshold1;
  real32_T leftDeflateThreshold1;
  real32_T rightInflateThreshold1;
  real32_T rightDeflateThreshold1;
  real32_T ratioInflateLeft1;
  real32_T ratioDeflateLeft1;
  real32_T ratioInflate1;
  real32_T ratioDeflate1;
  real32_T longSitMassageStop1;
  real32_T frontCmd1[3];
  real32_T sadThresholdIn1;
  real32_T sadNormalizeScaleIn1;
  real32_T livingConfirmCountIn1;
  real32_T spineBiasDeadband1;
  real32_T sickForwardMinMm1;
  real32_T sickBackDropRatio1;
  real32_T sickPairWindowSec1;
  real32_T bumpMinVelocity1;
  real32_T bumpMaxRms1;
  real32_T bumpMaxRangeMm1;
  real32_T manualMassageOn1;
  real32_T sitThresholdmin1;
  real32_T welcomeSideWingTime1;
  real32_T welcomeLegTime1;
  real32_T welcomeLumbarTime1;
  real32_T welcomeHipTime1;
  real32_T cushionForwardSign1;
  real32_T bumpTimeThresholdSec1;
  real32_T spineTimeThresholdSec1;
  real32_T pointThreshold1;
} ExtU_airbag_13Hz_T;

typedef struct {
  real32_T cushionData1[48];
  real32_T backrestData1[56];
  real32_T leftPressure1;
  real32_T rightPressure1;
  real32_T backMeanTotal_wing1;
  real32_T ratioInflateLeft_out1;
  real32_T ratioDeflateLeft_out1;
  real32_T backTotalThreshold_out1;
  real32_T upperMean1;
  real32_T lowerMean1;
  real32_T backMeanTotal_lumbar1;
  real32_T thresholdPassed1;
  real32_T ratioInflate_out1;
  real32_T ratioDeflate_out1;
  real32_T leftButtMean1;
  real32_T leftLegMean1;
  real32_T rightButtMean1;
  real32_T rightLegMean1;
  real32_T leftInflateThreshold_out1;
  real32_T leftDeflateThreshold_out1;
  real32_T rightInflateThreshold_out1;
  real32_T rightDeflateThreshold_out1;
  real32_T isFullSeat1;
  real32_T cushionSum1;
  real32_T backrestSum1;
  real32_T offCounter1;
  real32_T resetCounter1;
  real32_T backrestLostCounter1;
  real32_T reasonCode1;
  real32_T isLivingRaw1;
  real32_T confidence1;
  real32_T sadEnergy1;
  real32_T sadCushion1;
  real32_T sadBackrest1;
  real32_T sadScore1;
  real32_T detectionTriggered1;
  real32_T queueLength1;
  real32_T frame1[55];
  real32_T detectorEnabled_out1;
  real32_T frame_data_out1[92];
  real32_T inflation_time_out1;
  real32_T inflation_time1_out1;
  real32_T holding_time_out1;
  real32_T deflation_time_out1;
  real32_T longSitMinutes1;
  real32_T longSitMassageActive1;
  real32_T longSitCycleRemain1;
  real32_T longSitPrompt1;
  real32_T spineProtectActive1;
  real32_T spineProtectSide1;
  real32_T bumpReliefActive1;
  real32_T motionSicknessActive1;
  real32_T healthReasonCode1;
  real32_T spineBiasSeconds1;
  real32_T bumpDetectSeconds1;
  real32_T cushionForwardMoveMm1;
  real32_T backrestDropRatio1;
  real32_T sickEventCount1;
  real32_T isLiving1;
  real32_T isStatic1;
} ExtY_airbag_13Hz_T;

struct tag_RTM_airbag_13Hz_T {
  const char_T * volatile errorStatus;
};

extern DW_airbag_13Hz_T airbag_13Hz_DW;
extern ExtU_airbag_13Hz_T airbag_13Hz_U;
extern ExtY_airbag_13Hz_T airbag_13Hz_Y;
extern void airbag_13Hz_initialize(void);
extern void airbag_13Hz_step(void);
extern void airbag_13Hz_terminate(void);
extern RT_MODEL_airbag_13Hz_T *const airbag_13Hz_M;

#endif

