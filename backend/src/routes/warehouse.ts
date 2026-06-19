import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// ── CM35 bin data (parsed from CM35 BIN LOCATION RACK & FLOOR.xlsx) ──
const FLOOR_CONFIG: {zone:string;code:string}[] = [
  {zone:"A2",code:"A2-01"},{zone:"A2",code:"A2-02"},{zone:"A2",code:"A2-03"},
  {zone:"A3",code:"A3-01"},{zone:"A3",code:"A3-02"},{zone:"A3",code:"A3-03"},{zone:"A3",code:"A3-04"},{zone:"A3",code:"A3-05"},
  {zone:"B2",code:"B2-01"},{zone:"B2",code:"B2-02"},{zone:"B2",code:"B2-03"},{zone:"B2",code:"B2-04"},{zone:"B2",code:"B2-05"},
  {zone:"B3",code:"B3-01"},{zone:"B3",code:"B3-02"},{zone:"B3",code:"B3-03"},{zone:"B3",code:"B3-04"},{zone:"B3",code:"B3-05"},
  {zone:"C1",code:"C1-01"},{zone:"C1",code:"C1-02"},{zone:"C1",code:"C1-03"},{zone:"C1",code:"C1-04"},{zone:"C1",code:"C1-05"},
  {zone:"C2",code:"C2-01"},{zone:"C2",code:"C2-02"},{zone:"C2",code:"C2-03"},{zone:"C2",code:"C2-04"},{zone:"C2",code:"C2-05"},
  {zone:"C3",code:"C3-01"},{zone:"C3",code:"C3-02"},{zone:"C3",code:"C3-03"},{zone:"C3",code:"C3-04"},{zone:"C3",code:"C3-05"},
  {zone:"D1",code:"D1-01"},{zone:"D1",code:"D1-02"},{zone:"D1",code:"D1-03"},{zone:"D1",code:"D1-04"},{zone:"D1",code:"D1-05"},
  {zone:"D2",code:"D2-01"},{zone:"D2",code:"D2-02"},{zone:"D2",code:"D2-03"},{zone:"D2",code:"D2-04"},{zone:"D2",code:"D2-05"},
  {zone:"D3",code:"D3-01"},{zone:"D3",code:"D3-02"},{zone:"D3",code:"D3-03"},{zone:"D3",code:"D3-04"},{zone:"D3",code:"D3-05"},
  {zone:"E1",code:"E1-01"},{zone:"E1",code:"E1-02"},{zone:"E1",code:"E1-03"},{zone:"E1",code:"E1-04"},{zone:"E1",code:"E1-05"},
  {zone:"E2",code:"E2-01"},{zone:"E2",code:"E2-02"},{zone:"E2",code:"E2-03"},{zone:"E2",code:"E2-04"},{zone:"E2",code:"E2-05"},
  {zone:"E3",code:"E3-01"},{zone:"E3",code:"E3-02"},{zone:"E3",code:"E3-03"},{zone:"E3",code:"E3-04"},{zone:"E3",code:"E3-05"},
  {zone:"F1",code:"F1-01"},{zone:"F1",code:"F1-02"},{zone:"F1",code:"F1-03"},{zone:"F1",code:"F1-04"},{zone:"F1",code:"F1-05"},
  {zone:"F2",code:"F2-01"},{zone:"F2",code:"F2-02"},{zone:"F2",code:"F2-03"},{zone:"F2",code:"F2-04"},{zone:"F2",code:"F2-05"},
  {zone:"F3",code:"F3-01"},{zone:"F3",code:"F3-02"},{zone:"F3",code:"F3-03"},{zone:"F3",code:"F3-04"},
  {zone:"G1",code:"G1-01"},{zone:"G1",code:"G1-02"},{zone:"G1",code:"G1-03"},{zone:"G1",code:"G1-04"},{zone:"G1",code:"G1-05"},
  {zone:"G2",code:"G2-01"},{zone:"G2",code:"G2-02"},{zone:"G2",code:"G2-03"},{zone:"G2",code:"G2-04"},{zone:"G2",code:"G2-05"},
  {zone:"G3",code:"G3-01"},{zone:"G3",code:"G3-02"},{zone:"G3",code:"G3-03"},{zone:"G3",code:"G3-04"},
  {zone:"H1",code:"H1-01"},{zone:"H1",code:"H1-02"},{zone:"H1",code:"H1-03"},{zone:"H1",code:"H1-04"},{zone:"H1",code:"H1-05"},
  {zone:"H2",code:"H2-01"},{zone:"H2",code:"H2-02"},{zone:"H2",code:"H2-03"},{zone:"H2",code:"H2-04"},{zone:"H2",code:"H2-05"},
  {zone:"H3",code:"H3-01"},{zone:"H3",code:"H3-02"},{zone:"H3",code:"H3-03"},{zone:"H3",code:"H3-04"},{zone:"H3",code:"H3-05"},
  {zone:"J1",code:"J1-01"},{zone:"J1",code:"J1-02"},{zone:"J1",code:"J1-03"},{zone:"J1",code:"J1-04"},{zone:"J1",code:"J1-05"},
  {zone:"J2",code:"J2-01"},{zone:"J2",code:"J2-02"},{zone:"J2",code:"J2-03"},{zone:"J2",code:"J2-04"},{zone:"J2",code:"J2-05"},
  {zone:"J3",code:"J3-01"},{zone:"J3",code:"J3-02"},{zone:"J3",code:"J3-03"},{zone:"J3",code:"J3-04"},{zone:"J3",code:"J3-05"},
  {zone:"K2",code:"K2-01"},{zone:"K2",code:"K2-02"},{zone:"K2",code:"K2-03"},{zone:"K2",code:"K2-04"},{zone:"K2",code:"K2-05"},
  {zone:"K3",code:"K3-01"},{zone:"K3",code:"K3-02"},{zone:"K3",code:"K3-03"},{zone:"K3",code:"K3-04"},{zone:"K3",code:"K3-05"},
  {zone:"L1",code:"L1-01"},{zone:"L1",code:"L1-02"},{zone:"L1",code:"L1-03"},{zone:"L1",code:"L1-04"},{zone:"L1",code:"L1-05"},
  {zone:"L2",code:"L2-01"},{zone:"L2",code:"L2-02"},{zone:"L2",code:"L2-03"},{zone:"L2",code:"L2-04"},{zone:"L2",code:"L2-05"},
  {zone:"L3",code:"L3-01"},{zone:"L3",code:"L3-02"},{zone:"L3",code:"L3-03"},{zone:"L3",code:"L3-04"},{zone:"L3",code:"L3-05"},
  {zone:"M1",code:"M1-01"},{zone:"M1",code:"M1-02"},{zone:"M1",code:"M1-03"},{zone:"M1",code:"M1-04"},{zone:"M1",code:"M1-05"},{zone:"M1",code:"M1-06"},
  {zone:"M2",code:"M2-01"},{zone:"M2",code:"M2-02"},{zone:"M2",code:"M2-03"},{zone:"M2",code:"M2-04"},{zone:"M2",code:"M2-05"},{zone:"M2",code:"M2-06"},
  {zone:"M3",code:"M3-01"},{zone:"M3",code:"M3-02"},{zone:"M3",code:"M3-03"},{zone:"M3",code:"M3-04"},{zone:"M3",code:"M3-05"},{zone:"M3",code:"M3-06"},
];

const RACK_CONFIG: Record<string,Record<string,string[]>> = {
  RA: {
    RA1: ["RA1-01","RA1-02","RA1-03","RA1-04","RA1-05","RA1-06","RA1-09","RA1-10","RA1-11","RA1-12","RA1-13","RA1-14","RA1-15","RA1-16","RA1-17","RA1-18","RA1-19","RA1-20","RA1-21","RA1-22","RA1-23","RA1-24"],
    RA2: ["RA2-01","RA2-02","RA2-03","RA2-04","RA2-05","RA2-06","RA2-09","RA2-10","RA2-11","RA2-12","RA2-13","RA2-14","RA2-15","RA2-16","RA2-17","RA2-18","RA2-19","RA2-20","RA2-21","RA2-22","RA2-23","RA2-24"],
    RA3: ["RA3-01","RA3-02","RA3-03","RA3-04","RA3-05","RA3-06","RA3-07","RA3-08","RA3-09","RA3-10","RA3-11","RA3-12","RA3-15","RA3-16","RA3-17","RA3-18","RA3-19","RA3-20","RA3-21","RA3-22","RA3-23","RA3-24"],
    RA4: ["RA4-01","RA4-02","RA4-03","RA4-04","RA4-05","RA4-06","RA4-07","RA4-08","RA4-09","RA4-10","RA4-11","RA4-12","RA4-15","RA4-16","RA4-17","RA4-18","RA4-19","RA4-20","RA4-21","RA4-22","RA4-23","RA4-24"],
  },
  RB: {
    RB1: ["RB1-01","RB1-02","RB1-03","RB1-04","RB1-05","RB1-06","RB1-07","RB1-08","RB1-09","RB1-10","RB1-11","RB1-12","RB1-15","RB1-16","RB1-17","RB1-18","RB1-19","RB1-20","RB1-21","RB1-22","RB1-23","RB1-24","RB1-25","RB1-26","RB1-27","RB1-28","RB1-29","RB1-30"],
    RB2: ["RB2-01","RB2-02","RB2-03","RB2-04","RB2-05","RB2-06","RB2-07","RB2-08","RB2-09","RB2-10","RB2-11","RB2-12","RB2-15","RB2-16","RB2-17","RB2-18","RB2-19","RB2-20","RB2-21","RB2-22","RB2-23","RB2-24","RB2-25","RB2-26","RB2-27","RB2-28","RB2-29","RB2-30"],
    RB3: ["RB3-01","RB3-02","RB3-03","RB3-04","RB3-05","RB3-06","RB3-07","RB3-08","RB3-09","RB3-10","RB3-11","RB3-12","RB3-13","RB3-14","RB3-15","RB3-16","RB3-17","RB3-18","RB3-21","RB3-22","RB3-23","RB3-24","RB3-25","RB3-26","RB3-27","RB3-28","RB3-29","RB3-30"],
    RB4: ["RB4-01","RB4-02","RB4-03","RB4-04","RB4-05","RB4-06","RB4-07","RB4-08","RB4-09","RB4-10","RB4-11","RB4-12","RB4-13","RB4-14","RB4-15","RB4-16","RB4-17","RB4-18","RB4-21","RB4-22","RB4-23","RB4-24","RB4-25","RB4-26","RB4-27","RB4-28","RB4-29","RB4-30"],
  },
  RH: {
    RH1: ["RH1-01","RH1-02","RH1-03","RH1-04","RH1-05","RH1-06","RH1-07","RH1-08","RH1-11","RH1-12","RH1-13","RH1-14","RH1-15","RH1-16","RH1-17","RH1-18","RH1-21","RH1-22","RH1-23","RH1-24","RH1-25","RH1-26","RH1-27","RH1-28","RH1-29","RH1-30","RH1-31","RH1-32"],
    RH2: ["RH2-01","RH2-02","RH2-03","RH2-04","RH2-05","RH2-06","RH2-07","RH2-08","RH2-11","RH2-12","RH2-13","RH2-14","RH2-15","RH2-16","RH2-17","RH2-18","RH2-21","RH2-22","RH2-23","RH2-24","RH2-25","RH2-26","RH2-27","RH2-28","RH2-29","RH2-30","RH2-31","RH2-32"],
    RH3: ["RH3-01","RH3-02","RH3-03","RH3-04","RH3-05","RH3-06","RH3-07","RH3-08","RH3-11","RH3-12","RH3-13","RH3-14","RH3-15","RH3-16","RH3-17","RH3-18","RH3-19","RH3-20","RH3-23","RH3-24","RH3-25","RH3-26","RH3-27","RH3-28","RH3-29","RH3-30","RH3-31","RH3-32"],
    RH4: ["RH4-01","RH4-02","RH4-03","RH4-04","RH4-05","RH4-06","RH4-07","RH4-08","RH4-11","RH4-12","RH4-13","RH4-14","RH4-15","RH4-16","RH4-17","RH4-18","RH4-19","RH4-20","RH4-23","RH4-24","RH4-25","RH4-26","RH4-27","RH4-28","RH4-29","RH4-30","RH4-31","RH4-32"],
  },
  RI: {
    RI1: ["RI1-01","RI1-02","RI1-03","RI1-04","RI1-05","RI1-06","RI1-07","RI1-08","RI1-11","RI1-12","RI1-13","RI1-14","RI1-15","RI1-16","RI1-17","RI1-18","RI1-21","RI1-22","RI1-23","RI1-24","RI1-25","RI1-26","RI1-27","RI1-28","RI1-29","RI1-30","RI1-31","RI1-32"],
    RI2: ["RI2-01","RI2-02","RI2-03","RI2-04","RI2-05","RI2-06","RI2-07","RI2-08","RI2-11","RI2-12","RI2-13","RI2-14","RI2-15","RI2-16","RI2-17","RI2-18","RI2-21","RI2-22","RI2-23","RI2-24","RI2-25","RI2-26","RI2-27","RI2-28","RI2-29","RI2-30","RI2-31","RI2-32"],
    RI3: ["RI3-01","RI3-02","RI3-03","RI3-04","RI3-05","RI3-06","RI3-07","RI3-08","RI3-11","RI3-12","RI3-13","RI3-14","RI3-15","RI3-16","RI3-17","RI3-18","RI3-19","RI3-20","RI3-23","RI3-24","RI3-25","RI3-26","RI3-27","RI3-28","RI3-29","RI3-30","RI3-31","RI3-32"],
    RI4: ["RI4-01","RI4-02","RI4-03","RI4-04","RI4-05","RI4-06","RI4-07","RI4-08","RI4-11","RI4-12","RI4-13","RI4-14","RI4-15","RI4-16","RI4-17","RI4-18","RI4-19","RI4-20","RI4-23","RI4-24","RI4-25","RI4-26","RI4-27","RI4-28","RI4-29","RI4-30","RI4-31","RI4-32"],
  },
  RN: {
    RN1: ["RN1-01","RN1-02","RN1-03","RN1-04","RN1-05","RN1-06","RN1-07","RN1-08","RN1-09","RN1-10","RN1-13","RN1-14","RN1-15","RN1-16","RN1-17","RN1-18","RN1-19","RN1-20","RN1-23","RN1-24","RN1-25","RN1-26","RN1-27","RN1-28","RN1-29","RN1-30","RN1-31","RN1-32","RN1-33","RN1-34"],
    RN2: ["RN2-01","RN2-02","RN2-03","RN2-04","RN2-05","RN2-06","RN2-07","RN2-08","RN2-09","RN2-10","RN2-13","RN2-14","RN2-15","RN2-16","RN2-17","RN2-18","RN2-19","RN2-20","RN2-23","RN2-24","RN2-25","RN2-26","RN2-27","RN2-28","RN2-29","RN2-30","RN2-31","RN2-32","RN2-33","RN2-34"],
    RN3: ["RN3-01","RN3-02","RN3-03","RN3-04","RN3-05","RN3-06","RN3-07","RN3-08","RN3-09","RN3-10","RN3-13","RN3-14","RN3-15","RN3-16","RN3-17","RN3-18","RN3-19","RN3-20","RN3-21","RN3-22","RN3-25","RN3-26","RN3-27","RN3-28","RN3-29","RN3-30","RN3-31","RN3-32","RN3-33","RN3-34"],
    RN4: ["RN4-01","RN4-02","RN4-03","RN4-04","RN4-05","RN4-06","RN4-07","RN4-08","RN4-09","RN4-10","RN4-13","RN4-14","RN4-15","RN4-16","RN4-17","RN4-18","RN4-19","RN4-20","RN4-21","RN4-22","RN4-25","RN4-26","RN4-27","RN4-28","RN4-29","RN4-30","RN4-31","RN4-32","RN4-33","RN4-34"],
  },
  RO: {
    RO1: ["RO1-01","RO1-02","RO1-03","RO1-04","RO1-05","RO1-06","RO1-07","RO1-08","RO1-11","RO1-12","RO1-13","RO1-14","RO1-15","RO1-16","RO1-17","RO1-18","RO1-19","RO1-20","RO1-21","RO1-22","RO1-23","RO1-24","RO1-25","RO1-26","RO1-27","RO1-28"],
    RO2: ["RO2-01","RO2-02","RO2-03","RO2-04","RO2-05","RO2-06","RO2-07","RO2-08","RO2-11","RO2-12","RO2-13","RO2-14","RO2-15","RO2-16","RO2-17","RO2-18","RO2-19","RO2-20","RO2-21","RO2-22","RO2-23","RO2-24","RO2-25","RO2-26","RO2-27","RO2-28"],
    RO3: ["RO3-01","RO3-02","RO3-03","RO3-04","RO3-05","RO3-06","RO3-07","RO3-08","RO3-11","RO3-12","RO3-13","RO3-14","RO3-15","RO3-16","RO3-17","RO3-18","RO3-19","RO3-20","RO3-21","RO3-22","RO3-23","RO3-24","RO3-25","RO3-26","RO3-27","RO3-28"],
    RO4: ["RO4-01","RO4-02","RO4-03","RO4-04","RO4-05","RO4-06","RO4-07","RO4-08","RO4-11","RO4-12","RO4-13","RO4-14","RO4-15","RO4-16","RO4-17","RO4-18","RO4-19","RO4-20","RO4-21","RO4-22","RO4-23","RO4-24","RO4-25","RO4-26","RO4-27","RO4-28"],
  },
  RP: {
    RP1: ["RP1-01","RP1-02","RP1-03","RP1-04","RP1-05","RP1-06","RP1-07","RP1-08","RP1-11","RP1-12","RP1-13","RP1-14","RP1-15","RP1-16","RP1-17","RP1-18","RP1-19","RP1-20","RP1-21","RP1-22","RP1-23","RP1-24","RP1-25","RP1-26","RP1-27","RP1-28"],
    RP2: ["RP2-01","RP2-02","RP2-03","RP2-04","RP2-05","RP2-06","RP2-07","RP2-08","RP2-11","RP2-12","RP2-13","RP2-14","RP2-15","RP2-16","RP2-17","RP2-18","RP2-19","RP2-20","RP2-21","RP2-22","RP2-23","RP2-24","RP2-25","RP2-26","RP2-27","RP2-28"],
    RP3: ["RP3-01","RP3-02","RP3-03","RP3-04","RP3-05","RP3-06","RP3-07","RP3-08","RP3-11","RP3-12","RP3-13","RP3-14","RP3-15","RP3-16","RP3-17","RP3-18","RP3-19","RP3-20","RP3-21","RP3-22","RP3-23","RP3-24","RP3-25","RP3-26","RP3-27","RP3-28"],
    RP4: ["RP4-01","RP4-02","RP4-03","RP4-04","RP4-05","RP4-06","RP4-07","RP4-08","RP4-11","RP4-12","RP4-13","RP4-14","RP4-15","RP4-16","RP4-17","RP4-18","RP4-19","RP4-20","RP4-21","RP4-22","RP4-23","RP4-24","RP4-25","RP4-26","RP4-27","RP4-28"],
  },
  RQ: {
    RQ1: ["RQ1-01","RQ1-02","RQ1-03","RQ1-04","RQ1-05","RQ1-06","RQ1-07","RQ1-08","RQ1-09","RQ1-10","RQ1-11","RQ1-12","RQ1-13","RQ1-14","RQ1-15","RQ1-16","RQ1-17","RQ1-18","RQ1-19","RQ1-20","RQ1-21","RQ1-22","RQ1-23","RQ1-24","RQ1-25","RQ1-26","RQ1-27","RQ1-28","RQ1-29","RQ1-30"],
    RQ2: ["RQ2-01","RQ2-02","RQ2-03","RQ2-04","RQ2-05","RQ2-06","RQ2-07","RQ2-08","RQ2-09","RQ2-10","RQ2-11","RQ2-12","RQ2-13","RQ2-14","RQ2-15","RQ2-16","RQ2-17","RQ2-18","RQ2-19","RQ2-20","RQ2-21","RQ2-22","RQ2-23","RQ2-24","RQ2-25","RQ2-26","RQ2-27","RQ2-28","RQ2-29","RQ2-30"],
    RQ3: ["RQ3-01","RQ3-02","RQ3-03","RQ3-04","RQ3-05","RQ3-06","RQ3-09","RQ3-10","RQ3-11","RQ3-12","RQ3-13","RQ3-14","RQ3-15","RQ3-16","RQ3-17","RQ3-18","RQ3-21","RQ3-22","RQ3-23","RQ3-24","RQ3-25","RQ3-26","RQ3-27","RQ3-28","RQ3-29","RQ3-30"],
    RQ4: ["RQ4-01","RQ4-02","RQ4-03","RQ4-04","RQ4-05","RQ4-06","RQ4-09","RQ4-10","RQ4-11","RQ4-12","RQ4-13","RQ4-14","RQ4-15","RQ4-16","RQ4-17","RQ4-18","RQ4-21","RQ4-22","RQ4-23","RQ4-24","RQ4-25","RQ4-26","RQ4-27","RQ4-28","RQ4-29","RQ4-30"],
  },
};

// ── FG05 bin data (parsed from FG05 LOCATION.xlsx) ───────────────────
// Excluded: A2 (WH Entrance), B2 (Staging Area)
const FG05_FLOOR_CONFIG: {zone:string;code:string}[] = [
  // Section 1 — A-F (2 sub-zones each; A2 & B2 excluded)
  {zone:"A1",code:"A1-01"},{zone:"A1",code:"A1-02"},{zone:"A1",code:"A1-03"},{zone:"A1",code:"A1-04"},{zone:"A1",code:"A1-05"},
  {zone:"B1",code:"B1-01"},{zone:"B1",code:"B1-02"},{zone:"B1",code:"B1-03"},{zone:"B1",code:"B1-04"},{zone:"B1",code:"B1-05"},
  {zone:"C1",code:"C1-01"},{zone:"C1",code:"C1-02"},{zone:"C1",code:"C1-03"},{zone:"C1",code:"C1-04"},{zone:"C1",code:"C1-05"},
  {zone:"C2",code:"C2-01"},{zone:"C2",code:"C2-02"},{zone:"C2",code:"C2-03"},{zone:"C2",code:"C2-04"},{zone:"C2",code:"C2-05"},
  {zone:"D1",code:"D1-01"},{zone:"D1",code:"D1-02"},{zone:"D1",code:"D1-03"},{zone:"D1",code:"D1-04"},{zone:"D1",code:"D1-05"},
  {zone:"D2",code:"D2-01"},{zone:"D2",code:"D2-02"},{zone:"D2",code:"D2-03"},{zone:"D2",code:"D2-04"},{zone:"D2",code:"D2-05"},
  {zone:"E1",code:"E1-01"},{zone:"E1",code:"E1-02"},{zone:"E1",code:"E1-03"},{zone:"E1",code:"E1-04"},{zone:"E1",code:"E1-05"},
  {zone:"E2",code:"E2-01"},{zone:"E2",code:"E2-02"},{zone:"E2",code:"E2-03"},{zone:"E2",code:"E2-04"},{zone:"E2",code:"E2-05"},
  {zone:"F1",code:"F1-01"},{zone:"F1",code:"F1-02"},{zone:"F1",code:"F1-03"},{zone:"F1",code:"F1-04"},{zone:"F1",code:"F1-05"},
  {zone:"F2",code:"F2-01"},{zone:"F2",code:"F2-02"},{zone:"F2",code:"F2-03"},{zone:"F2",code:"F2-04"},{zone:"F2",code:"F2-05"},
  // Section 2 — G-L (2 sub-zones each; L2 has 4 bins)
  {zone:"G1",code:"G1-01"},{zone:"G1",code:"G1-02"},{zone:"G1",code:"G1-03"},{zone:"G1",code:"G1-04"},{zone:"G1",code:"G1-05"},
  {zone:"G2",code:"G2-01"},{zone:"G2",code:"G2-02"},{zone:"G2",code:"G2-03"},{zone:"G2",code:"G2-04"},{zone:"G2",code:"G2-05"},
  {zone:"H1",code:"H1-01"},{zone:"H1",code:"H1-02"},{zone:"H1",code:"H1-03"},{zone:"H1",code:"H1-04"},{zone:"H1",code:"H1-05"},
  {zone:"H2",code:"H2-01"},{zone:"H2",code:"H2-02"},{zone:"H2",code:"H2-03"},{zone:"H2",code:"H2-04"},{zone:"H2",code:"H2-05"},
  {zone:"I1",code:"I1-01"},{zone:"I1",code:"I1-02"},{zone:"I1",code:"I1-03"},{zone:"I1",code:"I1-04"},{zone:"I1",code:"I1-05"},
  {zone:"I2",code:"I2-01"},{zone:"I2",code:"I2-02"},{zone:"I2",code:"I2-03"},{zone:"I2",code:"I2-04"},{zone:"I2",code:"I2-05"},
  {zone:"J1",code:"J1-01"},{zone:"J1",code:"J1-02"},{zone:"J1",code:"J1-03"},{zone:"J1",code:"J1-04"},{zone:"J1",code:"J1-05"},
  {zone:"J2",code:"J2-01"},{zone:"J2",code:"J2-02"},{zone:"J2",code:"J2-03"},{zone:"J2",code:"J2-04"},{zone:"J2",code:"J2-05"},
  {zone:"K1",code:"K1-01"},{zone:"K1",code:"K1-02"},{zone:"K1",code:"K1-03"},{zone:"K1",code:"K1-04"},{zone:"K1",code:"K1-05"},
  {zone:"K2",code:"K2-01"},{zone:"K2",code:"K2-02"},{zone:"K2",code:"K2-03"},{zone:"K2",code:"K2-04"},{zone:"K2",code:"K2-05"},
  {zone:"L1",code:"L1-01"},{zone:"L1",code:"L1-02"},{zone:"L1",code:"L1-03"},{zone:"L1",code:"L1-04"},{zone:"L1",code:"L1-05"},
  {zone:"L2",code:"L2-01"},{zone:"L2",code:"L2-02"},{zone:"L2",code:"L2-03"},{zone:"L2",code:"L2-04"},
];

// ── Auto-seed CM35 if not yet populated ───────────────────────────────
async function ensureCM35Seeded(): Promise<string> {
  let wh = await prisma.warehouse.findFirst({ where: { code: 'CM35' } });
  if (!wh) {
    wh = await prisma.warehouse.create({
      data: {
        code: 'CM35',
        name: 'CM35 Warehouse',
        storageType: 'MIXED',
        totalCapacity: 100000,
        usedCapacity: 0,
        isActive: true,
      },
    });
    console.log('Created CM35 warehouse');
  }

  const floorCount = await prisma.floorLocation.count({ where: { warehouseId: wh.id } });
  if (floorCount === 0) {
    await prisma.floorLocation.createMany({
      data: FLOOR_CONFIG.map(f => ({
        warehouseId: wh!.id,
        zone: f.zone,
        code: f.code,
        capacity: 1000,
        usedCapacity: 0,
        isActive: true,
      })),
    });
    console.log(`Seeded ${FLOOR_CONFIG.length} floor locations`);
  }

  const rackCount = await prisma.rack.count({ where: { warehouseId: wh.id } });
  if (rackCount === 0) {
    for (const [rackCode, cols] of Object.entries(RACK_CONFIG)) {
      const totalBins = Object.values(cols).reduce((s, b) => s + b.length, 0);
      const rack = await prisma.rack.create({
        data: {
          warehouseId: wh.id,
          code: rackCode,
          isActive: true,
          totalCapacity: totalBins * 1000,
          usedCapacity: 0,
        },
      });
      for (const [colCode, bins] of Object.entries(cols)) {
        const rackRow = await prisma.rackRow.create({
          data: { rackId: rack.id, code: colCode },
        });
        for (let i = 0; i < bins.length; i++) {
          const level = await prisma.rackLevel.create({
            data: { rowId: rackRow.id, code: `${i + 1}`.padStart(2, '0') },
          });
          await prisma.bin.create({
            data: {
              levelId: level.id,
              rackId: rack.id,
              code: bins[i],
              capacity: 1000,
              usedCapacity: 0,
              isActive: true,
            },
          });
        }
      }
      console.log(`Seeded rack ${rackCode}`);
    }
  }

  return wh.id;
}

// ── Auto-seed FG05 if not yet populated ───────────────────────────────
async function ensureFG05Seeded(): Promise<string> {
  let wh = await prisma.warehouse.findFirst({ where: { code: 'FG05' } });
  if (!wh) {
    wh = await prisma.warehouse.create({
      data: {
        code: 'FG05',
        name: 'FG05 Warehouse',
        storageType: 'FLOOR',
        totalCapacity: 50000,
        usedCapacity: 0,
        isActive: true,
      },
    });
    console.log('Created FG05 warehouse');
  }

  const floorCount = await prisma.floorLocation.count({ where: { warehouseId: wh.id } });
  if (floorCount === 0) {
    await prisma.floorLocation.createMany({
      data: FG05_FLOOR_CONFIG.map(f => ({
        warehouseId: wh!.id,
        zone: f.zone,
        code: f.code,
        capacity: 1000,
        usedCapacity: 0,
        isActive: true,
      })),
    });
    console.log(`Seeded ${FG05_FLOOR_CONFIG.length} FG05 floor locations`);
  }

  return wh.id;
}

// ── GET /api/warehouse/layout?warehouse=CM35|FG05 ─────────────────────
router.get('/layout', async (req, res) => {
  try {
    const warehouseCode = (req.query.warehouse as string || 'CM35').toUpperCase();
    const warehouseId = warehouseCode === 'FG05'
      ? await ensureFG05Seeded()
      : await ensureCM35Seeded();

    // Floor locations
    const floorLocations = await prisma.floorLocation.findMany({
      where: { warehouseId, isActive: true },
      orderBy: [{ zone: 'asc' }, { code: 'asc' }],
    });

    // Racks (only CM35 has racks; FG05 is floor-only)
    const racks = warehouseCode === 'FG05' ? [] : await prisma.rack.findMany({
      where: { warehouseId, isActive: true },
      include: {
        rows: {
          include: {
            levels: {
              include: {
                bins: { where: { isActive: true } },
              },
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });

    // Inventory for this warehouse
    const inventory = await prisma.inventoryBatch.findMany({
      where: { warehouseId },
      include: { material: true },
      orderBy: { receiptDate: 'desc' },
    });

    res.json({ warehouseId, warehouseCode, floorLocations, racks, inventory });
  } catch (error: any) {
    console.error('warehouse/layout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/warehouse/list — all warehouses for dropdown ─────────────
router.get('/list', async (req, res) => {
  try {
    const warehouses = await prisma.warehouse.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, storageType: true },
      orderBy: { code: 'asc' },
    });
    res.json(warehouses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
