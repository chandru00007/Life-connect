


import React, { useState, useEffect, useMemo, useCallback, FormEvent, FC, ReactNode, useRef, isValidElement, cloneElement } from 'react';
import { GoogleGenAI, Type, LiveServerMessage, Modality, Blob, GenerateContentResponse } from "@google/genai";


// --- AI & AUDIO HELPERS ---
// Base64 decoding for audio data
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Raw PCM audio data to Web Audio API AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// PCM Float32Array to Base64-encoded Blob for Live API
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


// --- TYPE DEFINITIONS ---
type Page = 'donor' | 'waitlist' | 'admin' | 'hospital';
type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
type Organ = 'Heart' | 'Kidney' | 'Liver' | 'Eye' | 'Lungs' | 'Pancreas' | 'Bone Marrow';
type Urgency = 'Critical' | 'High' | 'Medium';
type Gender = 'Male' | 'Female' | 'Other' | 'Prefer not to say';

interface Donor {
    id: string;
    name: string;
    contact: string;
    dob: string;
    gender: Gender;
    bloodGroup: BloodGroup;
    address: string;
    aadharUrl: string;
    reportUrl: string;
    pledgedOrgans: Organ[];
    pledgeDate: number;
    status: 'Pledged';
}

interface Recipient {
    id:string;
    patientId: string;
    name: string;
    organNeeded: Organ;
    bloodGroup: BloodGroup;
    urgency: Urgency;
    timeOnList: number;
    hospitalId?: string;
    hospitalName?: string;
    clinicalNotes?: string;
    status: 'Searching' | 'Potential Match Found';
}

interface MatchResult {
    recipient: Recipient;
    donor: Donor;
}

interface Hospital {
  id: string;
  mockId: string;
  name: string;
  city: string;
  contact: string;
}

interface InterestNotification {
    id: string;
    donorId: string;
    organ: Organ;
    timestamp: number;
}


// --- CONSTANTS ---
const ORGANS: Organ[] = ['Heart', 'Eye', 'Bone Marrow', 'Kidney', 'Lungs', 'Liver', 'Pancreas'];
const BLOOD_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const URGENCY_LEVELS: Urgency[] = ['Critical', 'High', 'Medium'];
const GENDERS: Gender[] = ['Male', 'Female', 'Other', 'Prefer not to say'];
const ADMIN_PIN = '12345';

const HOSPITALS_DATA = [
  // Existing
  { id: 'apollo_bgl', name: 'Apollo Hospitals, Bannerghatta Road', city: 'Bangalore', contact: '1860-500-1066' },
  { id: 'fortis_cunningham_bgl', name: 'Fortis Hospital, Cunningham Road', city: 'Bangalore', contact: '080-4199-4444' },
  { id: 'manipal_bgl', name: 'Manipal Hospital, Old Airport Road', city: 'Bangalore', contact: '1800-102-5555' },
  { id: 'narayana_health_bgl', name: 'Narayana Health City', city: 'Bangalore', contact: '1860-208-0208' },
  { id: 'jss_msr', name: 'JSS Hospital, Mysuru', city: 'Mysore', contact: '0821-233-5555' },
  { id: 'kmc_mgl', name: 'KMC Hospital, Mangaluru', city: 'Mangalore', contact: '0824-244-5858' },
  { id: 'columbia_asia_bgl', name: 'Columbia Asia Hospital', city: 'Bangalore', contact: '080-6660-0666' },
  { id: 'bgs_gleneagles_bgl', name: 'BGS Gleneagles Global Hospital', city: 'Bangalore', contact: '080-2625-5555' },
  { id: 'kasturba_mnpl', name: 'Kasturba Hospital', city: 'Manipal', contact: '0820-292-2345' },
  { id: 'sdm_dwd', name: 'SDM Medical College & Hospital', city: 'Dharwad', contact: '0836-247-7507' },
  { id: 'father_muller_mgl', name: 'Father Muller Medical College Hospital', city: 'Mangalore', contact: '0824-223-8000' },
  { id: 'st_johns_bgl', name: 'St. John\'s Medical College Hospital', city: 'Bangalore', contact: '080-2206-5000' },
  { id: 'victoria_hosp_bgl', name: 'Victoria Hospital', city: 'Bangalore', contact: '080-2670-1150' },
  { id: 'bowring_lady_bgl', name: 'Bowring & Lady Curzon Hospital', city: 'Bangalore', contact: '080-2559-1365' },
  { id: 'sanjay_gandhi_trauma_bgl', name: 'Sanjay Gandhi Institute of Trauma', city: 'Bangalore', contact: '080-2653-4333' },
  { id: 'kidwai_oncology_bgl', name: 'Kidwai Memorial Institute of Oncology', city: 'Bangalore', contact: '080-2609-4000' },
  { id: 'jayadeva_cardio_bgl', name: 'Jayadeva Institute of Cardiovascular Sciences', city: 'Bangalore', contact: '080-2297-7200' },
  { id: 'sagar_hosp_bgl', name: 'Sagar Hospitals', city: 'Bangalore', contact: '080-4299-9999' },
  { id: 'hosmat_hosp_bgl', name: 'Hosmat Hospital', city: 'Bangalore', contact: '080-2559-3796' },
  { id: 'aster_cmi_bgl', name: 'Aster CMI Hospital', city: 'Bangalore', contact: '080-4342-0100' },
  { id: 'sakra_world_bgl', name: 'Sakra World Hospital', city: 'Bangalore', contact: '080-4969-4969' },
  { id: 'baptist_hosp_bgl', name: 'Baptist Hospital', city: 'Bangalore', contact: '080-2202-4700' },
  { id: 'ms_ramaiah_bgl', name: 'M S Ramaiah Memorial Hospital', city: 'Bangalore', contact: '080-2360-8888' },
  { id: 'st_marthas_bgl', name: 'St. Martha\'s Hospital', city: 'Bangalore', contact: '080-4012-8200' },
  { id: 'cloudnine_bgl', name: 'Cloudnine Hospital', city: 'Bangalore', contact: '1860-108-9999' },
  { id: 'vydehi_med_sci_bgl', name: 'Vydehi Institute of Medical Sciences', city: 'Bangalore', contact: '080-2841-3381' },
  { id: 'kims_bgl', name: 'Kempegowda Institute of Medical Sciences', city: 'Bangalore', contact: '080-2667-2727' },
  { id: 'bmcri_bgl', name: 'Bangalore Medical College and Research Institute', city: 'Bangalore', contact: '080-2670-0810' },
  { id: 'sparsh_hosp_bgl', name: 'Sparsh Hospital', city: 'Bangalore', contact: '080-6122-2000' },
  { id: 'vikram_hosp_bgl', name: 'Vikram Hospital', city: 'Bangalore', contact: '080-4609-4444' },
  { id: 'hcg_cancer_bgl', name: 'HCG Cancer Centre', city: 'Bangalore', contact: '080-4660-7700' },
  { id: 'people_tree_bgl', name: 'People Tree Hospitals', city: 'Bangalore', contact: '080-4959-9999' },
  { id: 'narayana_hrudayalaya_bgl', name: 'Narayana Institute of Cardiac Sciences', city: 'Bangalore', contact: '1860-208-0208' },
  { id: 'fortis_la_femme_bgl', name: 'Fortis La Femme', city: 'Bangalore', contact: '080-6746-4646' },
  { id: 'apollospectra_bgl', name: 'Apollo Spectra Hospitals', city: 'Bangalore', contact: '080-4612-4612' },
  { id: 'motherhood_bgl', name: 'Motherhood Hospital', city: 'Bangalore', contact: '1800-108-8008' },
  { id: 'columbiaasia_hebbal_bgl', name: 'Columbia Asia Hospital, Hebbal', city: 'Bangalore', contact: '080-4179-1000' },
  { id: 'chinmaya_bgl', name: 'Chinmaya Mission Hospital', city: 'Bangalore', contact: '080-2528-0425' },
  { id: 'shekhar_bgl', name: 'Shekhar Hospital', city: 'Bangalore', contact: '080-4248-5600' },
  { id: 'santhosh_bgl', name: 'Santhosh Hospital', city: 'Bangalore', contact: '080-4089-0500' },
  { id: 'apollo_bgs_msr', name: 'Apollo BGS Hospitals', city: 'Mysore', contact: '0821-256-8888' },
  { id: 'columbia_asia_msr', name: 'Columbia Asia Hospital', city: 'Mysore', contact: '0821-398-9896' },
  { id: 'narayana_multi_msr', name: 'Narayana Multispeciality Hospital', city: 'Mysore', contact: '1860-208-0208' },
  { id: 'kr_hosp_msr', name: 'K.R. Hospital', city: 'Mysore', contact: '0821-242-4551' },
  { id: 'cheluvamba_msr', name: 'Cheluvamba Hospital for Women and Children', city: 'Mysore', contact: '0821-242-0544' },
  { id: 'gokulam_msr', name: 'Gokulam Hospital', city: 'Mysore', contact: '0821-251-5555' },
  { id: 'kamakshi_msr', name: 'Kamakshi Hospital', city: 'Mysore', contact: '0821-236-4444' },
  { id: 'cauvery_heart_msr', name: 'Cauvery Heart & Multi-Speciality Hospital', city: 'Mysore', contact: '0821-241-4141' },
  { id: 'bharath_oncology_msr', name: 'Bharath Hospital and Institute of Oncology', city: 'Mysore', contact: '0821-252-1777' },
  { id: 'secure_hosp_msr', name: 'SECURE Hospital', city: 'Mysore', contact: '0821-428-2222' },
  { id: 'bhanavi_msr', name: 'Bhanavi Hospital', city: 'Mysore', contact: '0821-252-0000' },
  { id: 'radiant_msr', name: 'Radiant Hospital', city: 'Mysore', contact: '0821-252-2522' },
  { id: 'pramathi_msr', name: 'Pramathi Hospital', city: 'Mysore', contact: '0821-254-4444' },
  { id: 'st_josephs_msr', name: 'St. Joseph\'s Hospital', city: 'Mysore', contact: '0821-244-4422' },
  { id: 'basappa_msr', name: 'Basappa Memorial Hospital', city: 'Mysore', contact: '0821-244-2424' },
  { id: 'aj_hosp_mgl', name: 'A J Hospital & Research Centre', city: 'Mangalore', contact: '0824-222-5533' },
  { id: 'yenepoya_mgl', name: 'Yenepoya Medical College Hospital', city: 'Mangalore', contact: '0824-220-4668' },
  { id: 'indiana_hosp_mgl', name: 'Indiana Hospital & Heart Institute', city: 'Mangalore', contact: '0824-288-0880' },
  { id: 'scs_hosp_mgl', name: 'SCS Hospital', city: 'Mangalore', contact: '0824-221-1255' },
  { id: 'tejasvini_mgl', name: 'Tejasvini Hospital', city: 'Mangalore', contact: '0824-242-4242' },
  { id: 'kshema_mgl', name: 'K S Hegde Medical Academy (KSHEMA)', city: 'Mangalore', contact: '0824-220-4490' },
  { id: 'unity_hosp_mgl', name: 'Unity Hospital', city: 'Mangalore', contact: '0824-244-3065' },
  { id: 'wenlock_dist_mgl', name: 'Wenlock District Hospital', city: 'Mangalore', contact: '0824-242-3252' },
  { id: 'lady_goschen_mgl', name: 'Lady Goschen Hospital', city: 'Mangalore', contact: '0824-242-4522' },
  { id: 'omega_mgl', name: 'Omega Hospital', city: 'Mangalore', contact: '0824-244-0333' },
  { id: 'city_hosp_mgl', name: 'City Hospital', city: 'Mangalore', contact: '0824-244-1144' },
  { id: 'vasan_eye_mgl', name: 'Vasan Eye Care', city: 'Mangalore', contact: '1800-102-8272' },
  { id: 'vinaya_hosp_mgl', name: 'Vinaya Hospital & Research Centre', city: 'Mangalore', contact: '0824-227-6666' },
  { id: 'global_multi_mgl', name: 'Global Multispeciality Hospital', city: 'Mangalore', contact: '0824-245-5555' },
  { id: 'kims_hbl', name: 'Karnataka Institute of Medical Sciences (KIMS)', city: 'Hubli', contact: '0836-237-3348' },
  { id: 'sdm_med_dwd', name: 'SDM College of Medical Sciences & Hospital', city: 'Dharwad', contact: '0836-247-7507' },
  { id: 'tatwadarsha_hbl', name: 'Tatwadarsha Hospital', city: 'Hubli', contact: '0836-235-5555' },
  { id: 'vivekananda_hbl', name: 'Vivekananda General Hospital', city: 'Hubli', contact: '0836-236-2661' },
  { id: 'lifepoint_hbl', name: 'Lifepoint Multispeciality Hospital', city: 'Hubli', contact: '0836-425-5555' },
  { id: 'shushrusha_dwd', name: 'Shushrusha Nursing Home', city: 'Dharwad', contact: '0836-274-5555' },
  { id: 'dist_hosp_dwd', name: 'District Hospital', city: 'Dharwad', contact: '0836-244-7422' },
  { id: 'suchirayu_hbl', name: 'Suchirayu Hospital', city: 'Hubli', contact: '0836-222-2222' },
  { id: 'shree_devi_hbl', name: 'Shree Devi Hospital', city: 'Hubli', contact: '0836-235-1111' },
  { id: 'city_clinic_dwd', name: 'City Clinic', city: 'Dharwad', contact: '0836-274-8888' },
  { id: 'kle_hosp_hbl', name: 'KLE Hospital', city: 'Hubli', contact: '0836-227-7777' },
  { id: 'dr_hegde_hbl', name: 'Dr. Hegde Hospital', city: 'Hubli', contact: '0836-225-5555' },
  { id: 'patil_hosp_dwd', name: 'Patil Nursing Home', city: 'Dharwad', contact: '0836-244-4444' },
  { id: 'sarvodaya_hbl', name: 'Sarvodaya Hospital', city: 'Hubli', contact: '0836-226-6666' },
  { id: 'anand_dwd', name: 'Anand Hospital', city: 'Dharwad', contact: '0836-277-7777' },
  { id: 'jnmc_bga', name: 'Jawaharlal Nehru Medical College (JNMC) Hospital', city: 'Belgaum', contact: '0831-247-3777' },
  { id: 'kle_kore_bga', name: 'KLE Dr. Prabhakar Kore Hospital & MRC', city: 'Belgaum', contact: '0831-247-3777' },
  { id: 'lakeview_bga', name: 'Lakeview Goaves Hospital', city: 'Belgaum', contact: '0831-247-0777' },
  { id: 'vijaya_ortho_bga', name: 'Vijaya Ortho & Trauma Centre', city: 'Belgaum', contact: '0831-245-5555' },
  { id: 'belgaum_cancer_bga', name: 'Belgaum Cancer Hospital', city: 'Belgaum', contact: '0831-246-6666' },
  { id: 'kore_charitable_bga', name: 'Dr. Prabhakar Kore Charitable Hospital', city: 'Belgaum', contact: '0831-247-3777' },
  { id: 'gogte_nursing_bga', name: 'Gogte Nursing Home', city: 'Belgaum', contact: '0831-242-2222' },
  { id: 'sanjeevini_bga', name: 'Sanjeevini Hospital', city: 'Belgaum', contact: '0831-243-3333' },
  { id: 'bims_bga', name: 'Belgaum Institute of Medical Sciences (BIMS)', city: 'Belgaum', contact: '0831-240-3101' },
  { id: 'maratha_mandal_bga', name: 'Maratha Mandal\'s Hospital', city: 'Belgaum', contact: '0831-247-4777' },
  { id: 'ashwini_bga', name: 'Ashwini Hospital', city: 'Belgaum', contact: '0831-247-7777' },
  { id: 'vivekanand_bga', name: 'Vivekanand Hospital', city: 'Belgaum', contact: '0831-242-4242' },
  { id: 'shanti_bga', name: 'Shanti Hospital', city: 'Belgaum', contact: '0831-245-4545' },
  { id: 'city_hosp_bga', name: 'City Hospital', city: 'Belgaum', contact: '0831-246-4646' },
  { id: 'prerana_bga', name: 'Prerana Hospital', city: 'Belgaum', contact: '0831-247-4747' },
  { id: 'tma_pai_udupi', name: 'Dr. T.M.A. Pai Hospital', city: 'Udupi', contact: '0820-257-1201' },
  { id: 'adarsh_hosp_udupi', name: 'Adarsh Hospital', city: 'Udupi', contact: '0820-252-2522' },
  { id: 'hitech_medicare_udupi', name: 'Hi-Tech Medicare Hospital', city: 'Udupi', contact: '0820-253-3533' },
  { id: 'gandhi_hosp_udupi', name: 'Gandhi Hospital', city: 'Udupi', contact: '0820-252-1234' },
  { id: 'mahesh_hosp_udupi', name: 'Mahesh Hospital', city: 'Udupi', contact: '0820-252-5252' },
  { id: 'sri_krishna_udupi', name: 'Sri Krishna Hospital', city: 'Udupi', contact: '0820-253-0000' },
  { id: 'city_hosp_udupi', name: 'City Hospital', city: 'Udupi', contact: '0820-252-0888' },
  { id: 'mission_hosp_udupi', name: 'Mission Hospital', city: 'Udupi', contact: '0820-252-0555' },
  { id: 'amc_hosp_manipal', name: 'AMC Hospital', city: 'Manipal', contact: '0820-257-1999' },
  { id: 'vinaya_hosp_udupi', name: 'Vinaya Hospital', city: 'Udupi', contact: '0820-252-3333' },
  { id: 'mcgann_dist_smg', name: 'Mc Gann District Hospital', city: 'Shivamogga', contact: '08182-222-222' },
  { id: 'nanjappa_smg', name: 'Nanjappa Hospital', city: 'Shivamogga', contact: '08182-277-777' },
  { id: 'sahyadri_narayana_smg', name: 'Sahyadri Narayana Multispeciality Hospital', city: 'Shivamogga', contact: '1860-208-0208' },
  { id: 'sarji_smg', name: 'Sarji Hospital', city: 'Shivamogga', contact: '08182-255-555' },
  { id: 'subbaiah_med_smg', name: 'Subbaiah Institute of Medical Sciences', city: 'Shivamogga', contact: '08182-295-555' },
  { id: 'maxgann_smg', name: 'Maxgann Hospital', city: 'Shivamogga', contact: '08182-266-666' },
  { id: 'shankar_eye_smg', name: 'Shankar Eye Hospital', city: 'Shivamogga', contact: '08182-228-888' },
  { id: 'city_central_smg', name: 'City Central Hospital', city: 'Shivamogga', contact: '08182-277-277' },
  { id: 'asha_smg', name: 'Asha Hospital', city: 'Shivamogga', contact: '08182-221-122' },
  { id: 'gopala_gowda_smg', name: 'Gopala Gowda Shanthaveri Memorial Hospital', city: 'Shivamogga', contact: '08182-220-022' },
  { id: 'vims_blr', name: 'Vijayanagara Institute of Medical Sciences (VIMS)', city: 'Ballari', contact: '08392-235-201' },
  { id: 'st_marys_blr', name: 'St. Mary\'s Hospital', city: 'Ballari', contact: '08392-277-777' },
  { id: 'al_iqra_blr', name: 'AL-IQRA Hospital', city: 'Ballari', contact: '08392-266-666' },
  { id: 'dhanvantari_blr', name: 'Dhanvantari Hospital', city: 'Ballari', contact: '08392-255-555' },
  { id: 'bellary_city_blr', name: 'Bellary City Hospital', city: 'Ballari', contact: '08392-244-444' },
  { id: 'sri_raghavendra_blr', name: 'Sri Raghavendra Hospital', city: 'Ballari', contact: '08392-233-333' },
  { id: 'kalyani_blr', name: 'Kalyani Hospital', city: 'Ballari', contact: '08392-222-222' },
  { id: 'jyothi_blr', name: 'Jyothi Hospital', city: 'Ballari', contact: '08392-211-111' },
  { id: 'government_hosp_blr', name: 'Government Hospital', city: 'Ballari', contact: '08392-275-275' },
  { id: 'sunshine_blr', name: 'Sunshine Hospital', city: 'Ballari', contact: '08392-288-888' },
  { id: 'jjmmc_dvn', name: 'JJMMC Hospital', city: 'Davanagere', contact: '08192-231-388' },
  { id: 'bapuji_dvn', name: 'Bapuji Hospital', city: 'Davanagere', contact: '08192-221-288' },
  { id: 'city_central_dvn', name: 'City Central Hospital', city: 'Davanagere', contact: '08192-255-555' },
  { id: 'ssims_dvn', name: 'SS Institute of Medical Sciences & Research Centre', city: 'Davanagere', contact: '08192-266-666' },
  { id: 'chigateri_dist_dvn', name: 'Chigateri District Hospital', city: 'Davanagere', contact: '08192-232-088' },
  { id: 'aruna_dvn', name: 'Aruna Hospital', city: 'Davanagere', contact: '08192-277-777' },
  { id: 'anugraha_dvn', name: 'Anugraha Hospital', city: 'Davanagere', contact: '08192-266-266' },
  { id: 'santhosh_dvn', name: 'Santhosh Hospital', city: 'Davanagere', contact: '08192-244-444' },
  { id: 'srinivas_dvn', name: 'Srinivas Hospital', city: 'Davanagere', contact: '08192-233-333' },
  { id: 'shamanur_shivashankarappa_dvn', name: 'Shamanur Shivashankarappa Janakalyan Trust Hospital', city: 'Davanagere', contact: '08192-222-222' },
  { id: 'basaveshwar_klb', name: 'Basaveshwar Teaching and General Hospital', city: 'Kalaburagi', contact: '08472-220-303' },
  { id: 'united_hosp_klb', name: 'United Hospital', city: 'Kalaburagi', contact: '08472-255-555' },
  { id: 'esic_med_klb', name: 'ESIC Medical College & Hospital', city: 'Kalaburagi', contact: '08472-265-555' },
  { id: 'gda_hosp_klb', name: 'GDA Hospital', city: 'Kalaburagi', contact: '08472-244-444' },
  { id: 'humnabad_klb', name: 'Humnabad Hospital', city: 'Kalaburagi', contact: '08472-233-333' },
  { id: 'khaja_bandanawaz_klb', name: 'Khaja Bandanawaz Institute of Medical Sciences', city: 'Kalaburagi', contact: '08472-266-666' },
  { id: 'navodaya_klb', name: 'Navodaya Hospital', city: 'Kalaburagi', contact: '08472-277-777' },
  { id: 'soukhya_klb', name: 'Soukhya Hospital', city: 'Kalaburagi', contact: '08472-222-222' },
  { id: 'sai_klb', name: 'Sai Hospital', city: 'Kalaburagi', contact: '08472-211-111' },
  { id: 'vasavi_klb', name: 'Vasavi Hospital', city: 'Kalaburagi', contact: '08472-288-888' },
  { id: 'brims_bdr', name: 'Bidar Institute of Medical Sciences (BRIMS)', city: 'Bidar', contact: '08482-225-333' },
  { id: 'guru_nanak_bdr', name: 'Guru Nanak Hospital', city: 'Bidar', contact: '08482-222-222' },
  { id: 'bidar_city_bdr', name: 'Bidar City Hospital', city: 'Bidar', contact: '08482-233-333' },
  { id: 'mr_med_bdr', name: 'M.R. Medical College Hospital', city: 'Bidar', contact: '08482-244-444' },
  { id: 'prakash_bdr', name: 'Prakash Hospital', city: 'Bidar', contact: '08482-255-555' },
  { id: 'bhalke_bdr', name: 'Bhalke Hospital', city: 'Bidar', contact: '08482-266-666' },
  { id: 'shiva_bdr', name: 'Shiva Hospital', city: 'Bidar', contact: '08482-277-777' },
  { id: 'sanjivani_bdr', name: 'Sanjivani Hospital', city: 'Bidar', contact: '08482-288-888' },
  { id: 'basavakalyan_bdr', name: 'Basavakalyan Hospital', city: 'Bidar', contact: '08482-299-999' },
  { id: 'noori_bdr', name: 'Noori Hospital', city: 'Bidar', contact: '08482-211-111' },
  { id: 'hims_hsn', name: 'Hassan Institute of Medical Sciences (HIMS)', city: 'Hassan', contact: '08172-231-000' },
  { id: 'ssm_hosp_hsn', name: 'SSM Hospital', city: 'Hassan', contact: '08172-266-666' },
  { id: 'mangala_hsn', name: 'Mangala Hospital', city: 'Hassan', contact: '08172-255-555' },
  { id: 'city_hosp_hsn', name: 'City Hospital', city: 'Hassan', contact: '08172-244-444' },
  { id: 'chamarajendra_hsn', name: 'Sri Chamarajendra Hospital', city: 'Hassan', contact: '08172-233-333' },
  { id: 'hemavathi_hsn', name: 'Hemavathi Hospital', city: 'Hassan', contact: '08172-222-222' },
  { id: 'vasan_eye_hsn', name: 'Vasan Eye Care', city: 'Hassan', contact: '1800-102-8272' },
  { id: 'hosalli_hsn', name: 'Hosalli Hospital', city: 'Hassan', contact: '08172-277-777' },
  { id: 'nethradhama_hsn', name: 'Nethradhama Superspeciality Eye Hospital', city: 'Hassan', contact: '08172-288-888' },
  { id: 'malnad_hsn', name: 'Malnad Hospital', city: 'Hassan', contact: '08172-299-999' },
  { id: 'siddaganga_tmk', name: 'Siddaganga Hospital & Research Centre', city: 'Tumakuru', contact: '0816-228-1111' },
  { id: 'dist_govt_tmk', name: 'District Government Hospital', city: 'Tumakuru', contact: '0816-227-8686' },
  { id: 'shridevi_med_tmk', name: 'Shridevi Institute of Medical Sciences & Research Hospital', city: 'Tumakuru', contact: '0816-221-1555' },
  { id: 'adarsha_tmk', name: 'Adarsha Hospital', city: 'Tumakuru', contact: '0816-225-5555' },
  { id: 'sree_siddaganga_med_tmk', name: 'Sree Siddaganga Medical College And Research Institute', city: 'Tumakuru', contact: '0816-220-0222' },
  { id: 'seetharam_tmk', name: 'Seetharam Hospital', city: 'Tumakuru', contact: '0816-224-4444' },
  { id: 'sri_manjunatha_tmk', name: 'Sri Manjunatha Hospital', city: 'Tumakuru', contact: '0816-226-6666' },
  { id: 'vasavi_tmk', name: 'Vasavi Hospital', city: 'Tumakuru', contact: '0816-223-3333' },
  { id: 'mamatha_tmk', name: 'Mamatha Hospital', city: 'Tumakuru', contact: '0816-227-7777' },
  { id: 'aruna_tmk', name: 'Aruna Hospital', city: 'Tumakuru', contact: '0816-228-8888' },
];


const HOSPITALS: Hospital[] = HOSPITALS_DATA.map((hospital, index) => ({
    ...hospital,
    mockId: `HSP-${String(index + 1).padStart(3, '0')}`
}));


// --- MOCK DATA (for initial state if localStorage is empty) ---
const MOCK_DONORS: Donor[] = [];

const MOCK_RECIPIENTS: Recipient[] = [];


// --- LOCAL STORAGE HELPERS ---
const getStoredData = <T,>(key: string, fallback: T[]): T[] => {
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : fallback;
    } catch (error) {
        console.error(`Error reading from localStorage key "${key}":`, error);
        return fallback;
    }
};

const setStoredData = <T,>(key: string, data: T[]): void => {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error(`Error writing to localStorage key "${key}":`, error);
    }
};

// --- DOMAIN LOGIC HELPERS ---
const isBloodTypeCompatible = (donorBG: BloodGroup, recipientBG: BloodGroup): boolean => {
    const compatibility: Record<BloodGroup, BloodGroup[]> = {
        'A+': ['A+', 'A-', 'O+', 'O-'], 'A-': ['A-', 'O-'],
        'B+': ['B+', 'B-', 'O+', 'O-'], 'B-': ['B-', 'O-'],
        'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        'AB-': ['A-', 'B-', 'AB-', 'O-'],
        'O+': ['O+', 'O-'], 'O-': ['O-'],
    };
    return compatibility[recipientBG]?.includes(donorBG) ?? false;
};


// --- SVG ICONS ---
const IconWrapper: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>
);

const HeartIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></IconWrapper>;
const UsersIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></IconWrapper>;
const HospitalIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M12 6v4" /><path d="M14 14h-4" /><path d="M14 18h-4" /><path d="M14 10h-4" /><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2" /><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18" /></IconWrapper>;
const UserCheckIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9"cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></IconWrapper>;
const CheckCircleIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></IconWrapper>;
const XCircleIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></IconWrapper>;
const InfoIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></IconWrapper>;
const ListIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><line x1="8" x2="21" y1="6" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></IconWrapper>;
const BrainCircuitIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M12 2a2.5 2.5 0 0 0-2.5 2.5v.75a.5.5 0 0 1-1 0V4.5A2.5 2.5 0 0 0 6 2a2.5 2.5 0 0 0 0 5h.5a.5.5 0 0 1 0 1H6a2.5 2.5 0 0 0 0 5h.5a.5.5 0 0 1 0 1H6a2.5 2.5 0 0 0 2.5 2.5v.75a.5.5 0 0 1 1 0V19.5A2.5 2.5 0 0 0 12 22a2.5 2.5 0 0 0 0-5h-.5a.5.5 0 0 1 0-1H12a2.5 2.5 0 0 0 0-5h-.5a.5.5 0 0 1 0-1H12a2.5 2.5 0 0 0 2.5-2.5v-.75a.5.5 0 0 1 1 0V4.5A2.5 2.5 0 0 0 18 2a2.5 2.5 0 0 0 0 5h-.5a.5.5 0 0 1 0 1H18a2.5 2.5 0 0 0 0 5h-.5a.5.5 0 0 1 0 1H18a2.5 2.5 0 0 0-2.5 2.5v.75a.5.5 0 0 1-1 0V19.5A2.5 2.5 0 0 0 12 17a2.5 2.5 0 0 0 0 5Z" /><path d="M4.5 8.5v7" /><path d="M19.5 8.5v7" /></IconWrapper>;
const MessageSquareIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></IconWrapper>;
const AlertTriangleIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></IconWrapper>;
const MicIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></IconWrapper>;
const Volume2Icon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></IconWrapper>;
const ZapIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></IconWrapper>;
const BotMessageSquareIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M12 6V2H8"/><path d="m8 18-4 4V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2Z"/><path d="M2 12h2"/><path d="M9 12h2"/><path d="M16 12h2"/></IconWrapper>;
const XIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></IconWrapper>;
const SettingsIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></IconWrapper>;
const SendHorizonalIcon = ({ className = '' }: { className?: string }) => <IconWrapper className={className}><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></IconWrapper>;


// --- UI COMPONENTS ---

const Spinner = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const Button: FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { isLoading?: boolean; variant?: 'primary' | 'secondary' | 'tertiary' }> = ({ children, className, isLoading, variant = 'primary', ...props }) => {
    const variants = {
        primary: 'bg-rose-600 hover:bg-rose-700 focus:ring-rose-500',
        secondary: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500',
        tertiary: 'bg-slate-600 hover:bg-slate-700 focus:ring-slate-500'
    };

    return (
        <button
            className={`inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:bg-slate-500 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
            disabled={isLoading || props.disabled}
            {...props}
        >
            {isLoading && <Spinner />}
            {children}
        </button>
    );
};

const Input: FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ className, ...props }) => (
    <input
        className={`mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm shadow-sm placeholder-slate-400 text-white
        focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500
        disabled:bg-slate-600 disabled:text-slate-400 disabled:cursor-not-allowed
        ${className}`}
        {...props}
    />
);

const Select: FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({ className, children, ...props }) => (
    <select
        className={`mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm shadow-sm text-white
        focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500
        disabled:cursor-not-allowed
        ${className}`}
        {...props}
    >
        {children}
    </select>
);

const Textarea: FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ className, ...props }) => (
    <textarea
        className={`mt-1 block w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-sm shadow-sm placeholder-slate-400 text-white
        focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500
        disabled:cursor-not-allowed
        ${className}`}
        rows={3}
        {...props}
    />
);

const Card: FC<{ children: ReactNode; className?: string; title?: string; titleIcon?: ReactNode; titleClassName?: string; titleActions?: ReactNode; accentColor?: 'rose' | 'amber' | 'sky' | 'indigo' | 'slate'; }> = ({ children, className, title, titleIcon, titleClassName, titleActions, accentColor }) => {
    const accentColorClasses = {
        rose: 'border-t-rose-500',
        amber: 'border-t-amber-500',
        sky: 'border-t-sky-500',
        indigo: 'border-t-indigo-500',
        slate: 'border-t-slate-500'
    };
    const borderClass = accentColor ? `border-t-4 ${accentColorClasses[accentColor]}` : '';

    return (
        <div className={`bg-slate-800 shadow-lg rounded-xl overflow-hidden ${borderClass} ${className}`}>
            {title && (
                <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        {titleIcon && isValidElement<{ className?: string }>(titleIcon) && cloneElement(titleIcon, { className: `w-6 h-6 ${titleIcon.props.className || ''}` })}
                        <h2 className={`text-lg font-semibold text-white ${titleClassName}`}>{title}</h2>
                    </div>
                    {titleActions && <div>{titleActions}</div>}
                </div>
            )}
            <div className="p-6">
                {children}
            </div>
        </div>
    );
};

const Modal: FC<{ isOpen: boolean; onClose: () => void; children: ReactNode; }> = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="bg-emerald-600 rounded-xl shadow-xl text-white max-w-md w-full p-6 space-y-6 transform transition-all">
                {children}
                <div className="text-right">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-rose-600 hover:bg-rose-700 rounded-md font-semibold shadow-lg"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

const ConfirmationModal: FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; children: ReactNode; }> = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" aria-modal="true" role="dialog">
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-xl text-white max-w-md w-full p-6 space-y-6 transform transition-all">
                <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0 text-amber-500">
                        <AlertTriangleIcon className="w-6 h-6"/>
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-bold">{title}</h2>
                        <div className="text-slate-400 mt-2 text-sm">
                            {children}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end space-x-3">
                     <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md font-semibold shadow-sm text-sm"
                    >
                        Cancel
                    </button>
                    <Button onClick={onConfirm}>
                        Confirm Interest
                    </Button>
                </div>
            </div>
        </div>
    );
};

const InfoModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    icon?: ReactNode;
    children: ReactNode;
    accentColor?: 'indigo' | 'amber';
}> = ({ isOpen, onClose, title, icon, children, accentColor = 'indigo' }) => {
    if (!isOpen) return null;

    const accentClasses = {
        indigo: 'bg-indigo-900/70 border-indigo-700',
        amber: 'bg-amber-900/50 border-amber-700',
    };
    
    const iconWrapperClasses = {
        indigo: 'text-indigo-400',
        amber: 'text-amber-400',
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className={`bg-slate-800 border ${accentClasses[accentColor]} rounded-xl shadow-xl text-white max-w-lg w-full transform transition-all`}>
                <div className="p-6">
                    <div className="flex items-start space-x-4 mb-4">
                        {icon && <div className={`flex-shrink-0 ${iconWrapperClasses[accentColor]}`}>{icon}</div>}
                        <h2 className="text-xl font-bold flex-1">{title}</h2>
                    </div>
                    <div className="text-slate-300 text-sm space-y-4">
                        {children}
                    </div>
                </div>
                 <div className="bg-slate-900/50 px-6 py-3 text-right rounded-b-xl">
                    <Button onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
};


// --- VIEWS ---

const Header: FC<{ currentPage: Page; onNavigate: (page: Page) => void }> = ({ currentPage, onNavigate }) => {
    const NavLink: FC<{ page: Page; children: ReactNode; icon: ReactNode }> = ({ page, children, icon }) => {
        const isActive = currentPage === page;
        return (
            <button
                onClick={() => onNavigate(page)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${isActive ? 'bg-rose-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
            >
                {icon}
                <span>{children}</span>
            </button>
        );
    };

    return (
        <header className="bg-slate-900 text-white shadow-md">
            <nav className="container mx-auto px-4 py-3 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <HeartIcon className="text-rose-500 w-8 h-8"/>
                    <h1 className="text-2xl font-bold tracking-tight">LIFE CONNECT</h1>
                </div>
                <div className="flex items-center space-x-2">
                    <NavLink page="donor" icon={<UsersIcon className="w-5 h-5"/>}>Donor</NavLink>
                    <NavLink page="waitlist" icon={<ListIcon className="w-5 h-5"/>}>Waitlist</NavLink>
                    <NavLink page="hospital" icon={<HospitalIcon className="w-5 h-5"/>}>Hospital</NavLink>
                    <NavLink page="admin" icon={<BrainCircuitIcon className="w-5 h-5"/>}>Admin</NavLink>
                </div>
            </nav>
        </header>
    );
};

const PledgeCard: FC<{donor: Donor, organ: Organ, onWithdraw: (donorId: string, organ: Organ) => void}> = ({ donor, organ, onWithdraw }) => {
    // Create a pseudo-random ID for display based on donor ID and organ
    const displayId = useMemo(() => {
        let hash = 0;
        const str = donor.id + organ;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        return `plg_${new URLSearchParams(Math.abs(hash).toString(36)).toString().slice(0,12)}`;
    }, [donor.id, organ]);

    return (
    <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700 flex flex-col justify-between">
        <div>
            <div className="flex justify-between items-start">
                <h3 className="font-bold text-white text-lg">{donor.name} <span className="text-sm font-normal text-slate-400">({donor.bloodGroup})</span></h3>
            </div>
            <p className="text-sm text-slate-300 mt-1">Pledged: <span className="font-semibold text-rose-400">{organ}</span></p>
            <p className="text-xs text-slate-500 mt-1">ID: {displayId}</p>
        </div>
        <div className="mt-4 flex space-x-2">
            <button className="text-xs bg-sky-600/50 hover:bg-sky-600 text-white px-3 py-1.5 rounded-md w-full transition-colors">Edit Details</button>
            <button onClick={() => onWithdraw(donor.id, organ)} className="text-xs bg-rose-800/80 hover:bg-rose-800 text-white px-3 py-1.5 rounded-md w-full transition-colors">Withdraw Pledge</button>
        </div>
    </div>
)};

const initialFormData = {
    name: '',
    contact: '',
    dob: '',
    gender: GENDERS[2],
    bloodGroup: BLOOD_GROUPS[0],
    address: '',
    aadharUrl: '',
    reportUrl: '',
};

const DonorView: FC<{ donors: Donor[], onAddDonor: (donor: Omit<Donor, 'id' | 'pledgeDate' | 'status'>) => void, onWithdrawPledge: (donorId: string, organ: Organ) => void, recipients: Recipient[], onDonorInterest: (organ: Organ) => void, onOpenChat: () => void }> = ({ donors, onAddDonor, onWithdrawPledge, recipients, onDonorInterest, onOpenChat }) => {
    const [isPledgeFormOpen, setIsPledgeFormOpen] = useState(false);
    const [formData, setFormData] = useState(initialFormData);
    const [selectedOrgans, setSelectedOrgans] = useState<Set<Organ>>(new Set());
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [confirmModalData, setConfirmModalData] = useState<{organ: Organ, count: number} | null>(null);
    const [isInterestNotifiedModalOpen, setIsInterestNotifiedModalOpen] = useState(false);
    const [notifiedOrgan, setNotifiedOrgan] = useState<Organ | null>(null);


    const handleOrganCheckboxChange = (organ: Organ) => {
        setSelectedOrgans(prev => {
            const newSet = new Set(prev);
            if (newSet.has(organ)) newSet.delete(organ);
            else newSet.add(organ);
            return newSet;
        });
    };
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handlePledgeSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.contact || !formData.dob || !formData.address || selectedOrgans.size === 0) {
            alert('Please fill in all personal details and select at least one organ.');
            return;
        }
        setIsSubmitting(true);
        setTimeout(() => {
            onAddDonor({
                ...formData,
                gender: formData.gender as Gender,
                bloodGroup: formData.bloodGroup as BloodGroup,
                pledgedOrgans: Array.from(selectedOrgans),
            });
            setIsSubmitting(false);
            setIsPledgeFormOpen(false);
            setFormData(initialFormData);
            setSelectedOrgans(new Set());
        }, 500);
    };
    
    const handleOpenConfirmModal = (organ: Organ, count: number) => {
        setConfirmModalData({ organ, count });
        setIsConfirmModalOpen(true);
    };
    
    const handleConfirmInterest = () => {
        if (confirmModalData) {
            onDonorInterest(confirmModalData.organ);
            setNotifiedOrgan(confirmModalData.organ);
            setIsInterestNotifiedModalOpen(true);
        }
        setIsConfirmModalOpen(false);
        setConfirmModalData(null);
    };

    const organDemand = useMemo(() => {
      const counts = recipients.reduce((acc, recipient) => {
        acc[recipient.organNeeded] = (acc[recipient.organNeeded] || 0) + 1;
        return acc;
      }, {} as Record<Organ, number>);
      
      return Object.entries(counts)
        .map(([organ, count]) => ({ organ: organ as Organ, count }))
        .filter(({ count }) => count > 0);
    }, [recipients]);

    const totalPledges = useMemo(() => donors.reduce((acc, donor) => acc + donor.pledgedOrgans.length, 0), [donors]);

    const titleActions = (
        <button 
            onClick={() => setIsPledgeFormOpen(!isPledgeFormOpen)} 
            className="inline-flex items-center justify-center px-3 py-1 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
        >
            {isPledgeFormOpen ? 'Cancel' : '+ Register New Pledge'}
        </button>
    );

    return (
        <>
            <div className="space-y-8">
                <h1 className="text-3xl font-bold text-slate-200">Donor/Pledge Interface</h1>
                
                <Card accentColor="rose" title={`Registered Donor Pledges (${totalPledges})`} titleIcon={<HeartIcon className="text-rose-400"/>} titleActions={titleActions}>
                    {isPledgeFormOpen && (
                        <form onSubmit={handlePledgeSubmit} className="p-4 bg-slate-900/50 rounded-lg mb-6 space-y-6 animate-fade-in border border-slate-700">
                            <fieldset>
                                <legend className="text-lg font-medium text-rose-400 mb-4">Personal Details</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                    <div className="lg:col-span-2"><label className="block text-sm font-medium text-slate-300">Full Name (Pledger/Donor)</label><Input name="name" type="text" value={formData.name} onChange={handleInputChange} required /></div>
                                    <div className="lg:col-span-1"><label className="block text-sm font-medium text-slate-300">Contact Number</label><Input name="contact" type="tel" value={formData.contact} onChange={handleInputChange} required /></div>
                                    <div className="lg:col-span-1"><label className="block text-sm font-medium text-slate-300">Date of Birth</label><Input name="dob" type="date" value={formData.dob} onChange={handleInputChange} required /></div>
                                    <div className="lg:col-span-1"><label className="block text-sm font-medium text-slate-300">Gender</label><Select name="gender" value={formData.gender} onChange={handleInputChange}>{GENDERS.map(g => <option key={g} value={g}>{g}</option>)}</Select></div>
                                    <div className="lg:col-span-1"><label className="block text-sm font-medium text-slate-300">Blood Group</label><Select name="bloodGroup" value={formData.bloodGroup} onChange={handleInputChange}>{BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}</Select></div>
                                    <div className="lg:col-span-4"><label className="block text-sm font-medium text-slate-300">Full Residential Address</label><Textarea name="address" value={formData.address} onChange={handleInputChange} rows={2} required/></div>
                                </div>
                            </fieldset>
                            <fieldset>
                                <legend className="text-lg font-medium text-rose-400 mb-4">Mandatory Documentation (Mock URLs)</legend>
                                <p className="text-xs text-slate-400 mb-2">*In a real app, these would be file uploads. For this demo, please enter a mock URL (e.g., "https://myfiles.com/report.pdf").</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div><label className="block text-sm font-medium text-slate-300">Aadhar/ID Proof URL</label><Input name="aadharUrl" type="text" value={formData.aadharUrl} onChange={handleInputChange} required /></div>
                                     <div><label className="block text-sm font-medium text-slate-300">Latest Blood Report/Medical Summary URL</label><Input name="reportUrl" type="text" value={formData.reportUrl} onChange={handleInputChange} required /></div>
                                </div>
                            </fieldset>
                            <fieldset>
                                <legend className="text-lg font-medium text-rose-400 mb-2">Organs to Donate (Select one or more)</legend>
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                                    {ORGANS.map(organ => (
                                        <label key={organ} className="flex items-center space-x-2 bg-slate-700 p-2 rounded-md cursor-pointer hover:bg-slate-600">
                                            <input type="checkbox" checked={selectedOrgans.has(organ)} onChange={() => handleOrganCheckboxChange(organ)} className="form-checkbox h-4 w-4 rounded bg-slate-800 border-slate-600 text-rose-600 focus:ring-rose-500" />
                                            <span className="text-sm text-slate-200">{organ}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                            <div className="pt-2 flex items-center justify-end space-x-4">
                                <button type="button" onClick={() => setIsPledgeFormOpen(false)} className="text-sm text-slate-400 hover:text-white">Cancel</button>
                                <Button type="submit" isLoading={isSubmitting} disabled={selectedOrgans.size === 0}>Confirm New Pledge</Button>
                            </div>
                        </form>
                    )}

                    {totalPledges === 0 ? (
                        <div className="text-center text-slate-400 py-8">
                            No pledges registered yet. Click above to begin!
                        </div>
                    ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {donors.flatMap(donor => 
                                donor.pledgedOrgans.map(organ => (
                                    <PledgeCard key={`${donor.id}-${organ}`} donor={donor} organ={organ} onWithdraw={onWithdrawPledge} />
                                ))
                            )}
                       </div>
                    )}
                </Card>

                <Card accentColor="amber" title="Current Live Organ Demand" titleIcon={<ListIcon className="text-amber-400"/>}>
                    <p className="text-slate-400 mb-4 text-sm">Click on an organ below to express your potential willingness to donate and notify the central coordinator.</p>
                    {organDemand.length === 0 ? (
                        <div className="text-center text-slate-400 py-8">No active organ requests currently on the registry.</div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {organDemand.map(({ organ, count }) => (
                                <button key={organ} onClick={() => handleOpenConfirmModal(organ, count)} className="bg-slate-900/50 p-4 rounded-lg text-center border border-slate-700 hover:border-amber-500 hover:bg-slate-700 transition-all group">
                                    <p className="text-sm text-slate-300"> {organ} Needed</p>
                                    <p className="text-4xl font-bold text-amber-400 mt-1">{count}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </Card>

                <Card accentColor="sky" title="Organ Donation in India" titleIcon={<InfoIcon className="text-sky-400"/>}>
                    <p className="text-slate-400 leading-relaxed">Organ donation is governed by the **THOA (Transplantation of Human Organs Act)**. The process is centralized and monitored by the **National Organ and Tissue Transplant Organisation (NOTTO)** at the national level. Use the chat tool below to ask about laws, consent, and procedures.</p>
                </Card>
                
                <div onClick={onOpenChat} className="bg-amber-500 rounded-lg p-4 flex items-center justify-center space-x-3 cursor-pointer hover:bg-amber-600 transition-colors">
                    <MessageSquareIcon className="w-6 h-6 text-slate-900"/>
                    <span className="text-slate-900 font-bold">NOTTO Info Chat (Ask a Question)</span>
                </div>
            </div>
            
            <ConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={handleConfirmInterest}
                title={`Confirm Interest in ${confirmModalData?.organ} Donation`}
            >
                {confirmModalData && (
                     <p>You are indicating interest in donating your pledged {confirmModalData.organ} to address the current high demand of {confirmModalData.count} patient(s). This sends a potential lead notification to the Hospital Coordinator Admin for review and follow-up. Do you wish to proceed?</p>
                )}
            </ConfirmationModal>

            <Modal
                isOpen={isInterestNotifiedModalOpen}
                onClose={() => {
                    setIsInterestNotifiedModalOpen(false);
                    setNotifiedOrgan(null);
                }}
            >
                <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                        <CheckCircleIcon className="w-8 h-8 text-white"/>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Interest Notified</h2>
                        {notifiedOrgan && (
                        <p className="text-emerald-100 mt-2">
                            Your potential willingness to donate {notifiedOrgan} has been successfully notified to the Hospital Coordinator Admin. They will review the current urgent demand.
                        </p>
                    )}
                    </div>
                </div>
            </Modal>
        </>
    );
};

const WaitlistView: FC<{ recipients: Recipient[] }> = ({ recipients }) => {
    const [patientIdInput, setPatientIdInput] = useState('');
    const [searchedRecipient, setSearchedRecipient] = useState<Recipient | null>(null);
    const [searchPerformed, setSearchPerformed] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    const speak = useCallback((text: string) => {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        // Prioritize an Indian English voice if available
        let desiredVoice = voices.find(v => v.lang === 'en-IN');
        // Fallback to a generic Google English voice
        if (!desiredVoice) {
            desiredVoice = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'));
        }
        if (desiredVoice) utterance.voice = desiredVoice;
        window.speechSynthesis.speak(utterance);
    }, []);
    
    const getStatusMessage = useCallback((recipient: Recipient | null, id: string): string => {
        if (recipient) {
            if (recipient.status === 'Potential Match Found') {
                return `Good news, ${recipient.name}. A potential donor has expressed interest for the requested ${recipient.organNeeded}. Your hospital coordinator will be in touch with you shortly for the next steps.`;
            }
            return `Hello ${recipient.name}. We are actively searching for a compatible organ. Your status is active on the national waitlist.`;
        }
        return `Patient ID ${id} was not found in the registry. Please check the ID and try again.`;
    }, []);

    useEffect(() => {
        if (searchPerformed) {
            speak(getStatusMessage(searchedRecipient, patientIdInput));
        }
    }, [searchedRecipient, searchPerformed, speak, patientIdInput, getStatusMessage]);
    
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            const recognition = recognitionRef.current;
            recognition.continuous = false;
            recognition.lang = 'en-IN'; // Changed to Indian English
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setPatientIdInput(transcript.replace(/\.| /g, ''));
            };
            
            recognition.onend = () => setIsListening(false);
            recognition.onerror = (event: any) => {
                console.error('Speech recognition error', event.error);
                setIsListening(false);
            };
        }
    }, []);

    const handleListen = () => {
        if (isListening || !recognitionRef.current) return;
        setIsListening(true);
        try {
            recognitionRef.current.start();
        } catch (error) {
            console.error("Could not start recognition:", error);
            setIsListening(false);
        }
    };
    
    const handleSearch = (e: FormEvent) => {
        e.preventDefault();
        const found = recipients.find(r => r.patientId.toLowerCase() === patientIdInput.toLowerCase().trim());
        setSearchedRecipient(found || null);
        setSearchPerformed(true);
    };

    const timeOnListDays = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    };

    const statusMessage = getStatusMessage(searchedRecipient, patientIdInput);
    const cardTitleActions = searchedRecipient ? (
        <button onClick={() => speak(statusMessage)} className="text-slate-400 hover:text-white transition-colors">
            <Volume2Icon className="w-5 h-5"/>
        </button>
    ) : null;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <Card title="Check Patient Status" titleIcon={<UserCheckIcon className="text-cyan-400"/>}>
                <p className="text-slate-400 mb-4">Enter the Patient ID provided by the hospital to check the current status of the organ request.</p>
                <form onSubmit={handleSearch} className="flex space-x-2">
                    <div className="relative flex-grow">
                        <Input 
                            type="text" 
                            value={patientIdInput}
                            onChange={e => setPatientIdInput(e.target.value)}
                            placeholder="Enter or Speak Patient ID (e.g., NOD-1701)"
                            className="w-full pr-10"
                            required
                        />
                        <button 
                            type="button" 
                            onClick={handleListen}
                            disabled={isListening}
                            className={`absolute inset-y-0 right-0 flex items-center px-3 rounded-r-md ${isListening ? 'text-rose-500 animate-pulse' : 'text-slate-400 hover:text-white'}`}
                        >
                            <MicIcon className="w-5 h-5"/>
                        </button>
                    </div>
                    <Button type="submit">Check Status</Button>
                </form>
            </Card>

            {searchPerformed && (
                searchedRecipient ? (
                    <Card title={`Status for Patient ID: ${searchedRecipient.patientId}`} titleIcon={<InfoIcon className="text-emerald-400"/>} titleActions={cardTitleActions}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-slate-300">
                            <div><strong className="text-slate-400 block font-medium">Name:</strong> {searchedRecipient.name}</div>
                            <div><strong className="text-slate-400 block font-medium">Organ Needed:</strong> {searchedRecipient.organNeeded}</div>
                            <div><strong className="text-slate-400 block font-medium">Blood Group:</strong> {searchedRecipient.bloodGroup}</div>
                            <div><strong className="text-slate-400 block font-medium">Urgency:</strong> <span className={`px-2 py-1 text-xs font-semibold rounded-full ${searchedRecipient.urgency === 'Critical' ? 'bg-red-500/20 text-red-400' : searchedRecipient.urgency === 'High' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{searchedRecipient.urgency}</span></div>
                            <div className="md:col-span-2"><strong className="text-slate-400 block font-medium">Registered Hospital:</strong> {searchedRecipient.hospitalName}</div>
                            <div className="md:col-span-2"><strong className="text-slate-400 block font-medium">Status:</strong> 
                                {searchedRecipient.status === 'Potential Match Found' ? (
                                    <span className="text-emerald-400 font-semibold">Potential Match Found</span>
                                ) : (
                                    <span className="text-cyan-400 font-semibold">Active on Waitlist</span>
                                )}
                            </div>
                             <div className="md:col-span-2"><strong className="text-slate-400 block font-medium">Time on Waitlist:</strong> {timeOnListDays(searchedRecipient.timeOnList)} days</div>

                             {searchedRecipient.status === 'Potential Match Found' && (
                                <div className="md:col-span-2 mt-4 p-3 bg-emerald-500/10 rounded-md border border-emerald-500/30">
                                    <p className="font-bold text-emerald-400">Action Required:</p>
                                    <p className="text-slate-300 text-sm">Please contact your hospital coordinator immediately for next steps.</p>
                                    <p className="text-slate-300 text-sm mt-1">
                                        Contact: <span className="font-semibold text-white">{HOSPITALS.find(h => h.mockId === searchedRecipient.hospitalId)?.contact || 'See hospital directory'}</span>
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                ) : (
                    <Card title="Not Found" titleIcon={<XCircleIcon className="text-red-400"/>}>
                        <p className="text-slate-400">No recipient found with the ID "{patientIdInput}". Please verify the ID and try again.</p>
                    </Card>
                )
            )}
        </div>
    );
};

const HospitalView: FC<{ recipients: Recipient[]; onAddRecipient: (recipient: Recipient) => void }> = ({ recipients, onAddRecipient }) => {
    const [selectedHospital, setSelectedHospital] = useState<Hospital>(HOSPITALS[0]);
    const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
    const [newlyCreatedRecipient, setNewlyCreatedRecipient] = useState<Recipient | null>(null);
    
    const [formData, setFormData] = useState({
        name: '',
        organNeeded: ORGANS[1],
        bloodGroup: BLOOD_GROUPS[0],
        urgency: URGENCY_LEVELS[2],
        clinicalNotes: '',
    });
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionStatus, setSubmissionStatus] = useState<'success' | 'error' | null>(null);

    const hospitalRequests = useMemo(() => {
        return recipients
            .filter(r => r.hospitalId === selectedHospital.mockId)
            .sort((a, b) => a.timeOnList - b.timeOnList);
    }, [recipients, selectedHospital]);
    
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!formData.name || !formData.organNeeded || !formData.bloodGroup || !formData.urgency) {
            alert('Please fill all required fields.');
            return;
        }
        setIsSubmitting(true);
        setSubmissionStatus(null);

        // Simulate async operation
        setTimeout(() => {
            try {
                const randomId = Math.floor(1000 + Math.random() * 9000);
                const newRecipient: Recipient = {
                    ...formData,
                    id: `r${Date.now()}`,
                    patientId: `NOD-${randomId}`,
                    timeOnList: Date.now(),
                    hospitalId: selectedHospital.mockId,
                    hospitalName: selectedHospital.name,
                    status: 'Searching',
                };
                onAddRecipient(newRecipient);

                setNewlyCreatedRecipient(newRecipient);
                setIsSuccessModalOpen(true);
                
                setSubmissionStatus('success');
                setFormData({
                    name: '',
                    organNeeded: ORGANS[1],
                    bloodGroup: BLOOD_GROUPS[0],
                    urgency: URGENCY_LEVELS[2],
                    clinicalNotes: '',
                });

            } catch (error) {
                console.error("Error submitting request:", error);
                setSubmissionStatus('error');
            } finally {
                setIsSubmitting(false);
            }
        }, 500);
    };
    
    return (
        <>
            <div className="space-y-6">
                <Card title="Select Hospital" titleIcon={<HospitalIcon className="text-sky-400"/>}>
                    <Select
                        value={selectedHospital.id}
                        onChange={e => setSelectedHospital(HOSPITALS.find(h => h.id === e.target.value) || HOSPITALS[0])}
                        className="bg-slate-700"
                    >
                        {HOSPITALS.map(h => <option key={h.id} value={h.id}>{h.name}, {h.city}</option>)}
                    </Select>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card title="New Organ Request" titleIcon={<UserCheckIcon className="text-rose-400" />} titleClassName="text-rose-400">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <fieldset className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300">Patient Name / ID</label>
                                        <Input name="name" type="text" value={formData.name} onChange={handleInputChange} required />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300">Organ Needed</label>
                                        <Select name="organNeeded" value={formData.organNeeded} onChange={handleInputChange}>
                                            {ORGANS.map(o => <option key={o} value={o}>{o}</option>)}
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300">Blood Group</label>
                                        <Select name="bloodGroup" value={formData.bloodGroup} onChange={handleInputChange}>
                                            {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-300">Urgency Level</label>
                                        <Select name="urgency" value={formData.urgency} onChange={handleInputChange}>
                                            {URGENCY_LEVELS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </Select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300">Notes (optional)</label>
                                    <Textarea name="clinicalNotes" value={formData.clinicalNotes} onChange={handleInputChange} />
                                </div>
                            </fieldset>
                            <div className="pt-2">
                                <Button type="submit" isLoading={isSubmitting} className="w-full">
                                    {isSubmitting ? 'Registering...' : 'Register Patient on National Waitlist'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                    <Card title={`Current Active Requests (${hospitalRequests.length})`} titleIcon={<ListIcon className="text-amber-400"/>} titleClassName="text-amber-400">
                        <div className="max-h-96 overflow-y-auto">
                            {hospitalRequests.length === 0 ? <p className="text-slate-400">No active requests for this hospital.</p> : (
                                <table className="w-full text-left text-sm">
                                    <thead className="text-xs text-slate-400 uppercase bg-slate-900 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-3">Patient</th>
                                            <th className="px-4 py-3">Organ</th>
                                            <th className="px-4 py-3">Urgency</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-slate-300">
                                        {hospitalRequests.map(r => (
                                            <tr key={r.id} className="border-b border-slate-700">
                                                <td className="px-4 py-3">{r.name}</td>
                                                <td className="px-4 py-3">{r.organNeeded}</td>
                                                <td className="px-4 py-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${r.urgency === 'Critical' ? 'bg-red-500/20 text-red-400' : r.urgency === 'High' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>{r.urgency}</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </Card>
                </div>
            </div>
            <Modal
                isOpen={isSuccessModalOpen}
                onClose={() => setIsSuccessModalOpen(false)}
            >
                <div className="flex items-start space-x-4">
                    <div className="flex-shrink-0">
                        <CheckCircleIcon className="w-8 h-8 text-white"/>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Request Submitted</h2>
                        {newlyCreatedRecipient && (
                        <p className="text-emerald-100 mt-2">
                            Organ request for patient <span className="font-bold">{newlyCreatedRecipient.patientId}</span> submitted successfully by {selectedHospital.name}. It is now live on the registry.
                        </p>
                    )}
                    </div>
                </div>
            </Modal>
        </>
    );
};

const StatCard: FC<{ title: string; value: number | string, className?: string }> = ({ title, value, className }) => (
    <div className={`bg-slate-800 p-4 rounded-lg shadow-md ${className}`}>
        <p className="text-sm text-slate-400 uppercase tracking-wider">{title}</p>
        <p className="text-3xl font-bold text-white mt-1">{value}</p>
    </div>
);

const AdminAuthView: FC<{ onAuthSuccess: () => void }> = ({ onAuthSuccess }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (pin === ADMIN_PIN) {
            onAuthSuccess();
        } else {
            setError('Incorrect PIN. Please try again.');
            setPin('');
        }
    };

    return (
        <div className="max-w-md mx-auto mt-10 animate-fade-in">
            <Card title="Admin Access Required" accentColor="indigo">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <p className="text-slate-400">Please enter the admin PIN to access the coordinator dashboard.</p>
                    <div>
                        <Input 
                            type="password" 
                            value={pin}
                            onChange={e => setPin(e.target.value)}
                            placeholder="Enter PIN"
                            maxLength={5}
                            autoFocus
                            className="text-center text-lg tracking-widest"
                        />
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                    <Button type="submit" className="w-full" variant="secondary">Unlock Dashboard</Button>
                </form>
            </Card>
        </div>
    );
};

const AdminView: FC<{
    donors: Donor[], 
    recipients: Recipient[], 
    notifications: InterestNotification[],
    onClearNotification: (id: string) => void,
    onUpdateRecipientUrgency: (id: string, urgency: Urgency) => void,
    onDeleteRecipient: (id: string) => void,
    onAddMockRecipient: () => void;
}> = ({ donors, recipients, notifications, onClearNotification, onUpdateRecipientUrgency, onDeleteRecipient, onAddMockRecipient }) => {
    const [isMatching, setIsMatching] = useState(false);
    const [isUrgencyModalOpen, setIsUrgencyModalOpen] = useState(false);
    const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
    const [isScreeningModalOpen, setIsScreeningModalOpen] = useState(false);
    const [matchModalContent, setMatchModalContent] = useState<MatchResult[] | null>(null);
    const [screeningModalNotification, setScreeningModalNotification] = useState<InterestNotification | null>(null);
    
    const potentialMatches = useMemo(() => recipients.filter(r => r.status === 'Potential Match Found').length, [recipients]);

    const organSupplyDemand = useMemo(() => {
        const demand = recipients.reduce((acc, r) => {
            acc[r.organNeeded] = (acc[r.organNeeded] || 0) + 1;
            return acc;
        }, {} as Record<Organ, number>);

        const supply = donors.reduce((acc, d) => {
            d.pledgedOrgans.forEach(organ => {
                acc[organ] = (acc[organ] || 0) + 1;
            });
            return acc;
        }, {} as Record<Organ, number>);

        const allOrgans = Array.from(new Set([...Object.keys(demand), ...Object.keys(supply)])) as Organ[];
        return allOrgans.map(organ => ({
            organ,
            demand: demand[organ] || 0,
            supply: supply[organ] || 0,
        }));
    }, [donors, recipients]);

    const timeOnListDays = (timestamp: number) => {
        const diff = Date.now() - timestamp;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    };

    const calculateScore = (recipient: Recipient) => {
        const urgencyScore = recipient.urgency === 'Critical' ? 150 : recipient.urgency === 'High' ? 100 : 50;
        const timeScore = timeOnListDays(recipient.timeOnList);
        return urgencyScore + timeScore;
    };
    
    const sortedRecipients = useMemo(() => 
        [...recipients].sort((a, b) => calculateScore(b) - calculateScore(a)),
    [recipients]);

    const handleRunMatching = () => {
        setIsMatching(true);
        setTimeout(() => {
            const matches: MatchResult[] = [];
            let availableDonors = [...donors];
            
            const donorOrganMap = new Map<Organ, Donor[]>();
            availableDonors.forEach(d => {
                d.pledgedOrgans.forEach(o => {
                    if (!donorOrganMap.has(o)) donorOrganMap.set(o, []);
                    donorOrganMap.get(o)?.push(d);
                })
            });

            sortedRecipients.forEach(recipient => {
                const compatibleDonors = donorOrganMap.get(recipient.organNeeded) || [];
                const compatibleAndAvailable = compatibleDonors.filter(d => isBloodTypeCompatible(d.bloodGroup, recipient.bloodGroup));

                if (compatibleAndAvailable.length > 0) {
                    const matchedDonor = compatibleAndAvailable[0];
                    matches.push({ recipient, donor: matchedDonor });
                    availableDonors = availableDonors.filter(d => d.id !== matchedDonor.id);
                    donorOrganMap.set(recipient.organNeeded, (donorOrganMap.get(recipient.organNeeded) || []).filter(d => d.id !== matchedDonor.id));
                }
            });
            
            setMatchModalContent(matches);
            setIsMatchModalOpen(true);
            setIsMatching(false);
        }, 1500);
    };

    const handleUrgencyAnalysis = () => {
        if (recipients.length === 0) {
            alert('No recipients on the waitlist to analyze.');
            return;
        }
        setIsUrgencyModalOpen(true);
    };

    const handleOpenScreeningModal = (notification: InterestNotification) => {
        setScreeningModalNotification(notification);
        setIsScreeningModalOpen(true);
    };

    return (
        <>
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-slate-200">Hospital Coordinator Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Total Pledged Donors" value={donors.length} className="border-t-4 border-rose-500"/>
                <StatCard title="Active Recipients" value={recipients.length} className="border-t-4 border-rose-500"/>
                <StatCard title="Potential Matches" value={potentialMatches} className="border-t-4 border-rose-500"/>
            </div>

            <Card title="Organ Demand vs. Pledged Supply">
                <div className="space-y-6">
                    {organSupplyDemand.length > 0 ? organSupplyDemand.map(({organ, demand, supply}) => {
                        const maxVal = Math.max(demand, supply, 1);
                        return (
                            <div key={organ}>
                                <h3 className="text-lg font-bold text-white mb-2">{organ}</h3>
                                <div className="space-y-2">
                                    <div className="flex items-center space-x-4">
                                        <div className="w-full bg-slate-700 rounded-full h-6">
                                            <div className="bg-rose-600 h-6 rounded-full flex items-center justify-end pr-2" style={{ width: `${(demand / maxVal) * 100}%` }}>
                                                <span className="text-sm font-medium text-white">{demand}</span>
                                            </div>
                                        </div>
                                        <span className="text-sm text-slate-400 w-20 text-right">Demand</span>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                        <div className="w-full bg-slate-700 rounded-full h-6">
                                            <div className="bg-green-600 h-6 rounded-full flex items-center justify-end pr-2" style={{ width: `${(supply / maxVal) * 100}%` }}>
                                               <span className="text-sm font-medium text-white">{supply}</span>
                                            </div>
                                        </div>
                                        <span className="text-sm text-slate-400 w-20 text-right">Pledged</span>
                                    </div>
                                </div>
                            </div>
                        )
                    }) : <p className="text-slate-400 text-center py-4">No supply or demand data available.</p>}
                </div>
            </Card>

            <div className="bg-slate-800 p-4 rounded-lg flex items-center justify-between space-x-4">
                <button onClick={handleUrgencyAnalysis} className="flex-1 text-center px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold rounded-md transition-colors flex items-center justify-center space-x-2">
                    <ZapIcon className="w-5 h-5" />
                    <span>Urgency Prioritization Analysis</span>
                </button>
                 <Button onClick={handleRunMatching} variant="secondary" className="flex-1" isLoading={isMatching}>
                    {isMatching ? 'Calculating...' : 'Run Match Algorithm (Simulate)'}
                </Button>
                <Button onClick={onAddMockRecipient} variant="tertiary" className="flex-1">Add Mock Recipient</Button>
            </div>
            
            <Card title={`Live Donor Interest Notifications (${notifications.length})`} titleIcon={<HeartIcon className="text-indigo-400"/>} accentColor="indigo">
                <p className="text-sm text-slate-400 mb-4">These donors have explicitly indicated a willingness to donate. Use the AI tool to assist in initial screening.</p>
                <div className="max-h-72 overflow-y-auto">
                {notifications.length > 0 ? (
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-900 sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Donor/City/BG</th>
                                <th className="px-4 py-3">Organ</th>
                                <th className="px-4 py-3">Date/Time</th>
                                <th className="px-4 py-3">Screening Action</th>
                                <th className="px-4 py-3 text-right">Clear</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-300">
                           {notifications.map(notification => {
                               const donor = donors.find(d => d.id === notification.donorId);
                               if (!donor) return null;
                               return (
                                    <tr key={notification.id} className="border-b border-slate-700">
                                        <td className="px-4 py-3">
                                            <div className="font-semibold">{donor.name} ({donor.bloodGroup})</div>
                                            <div className="text-xs text-slate-400">City: {donor.address.split(',').pop()?.trim() || 'N/A'}</div>
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-rose-400">{notification.organ}</td>
                                        <td className="px-4 py-3">{new Date(notification.timestamp).toLocaleString()}</td>
                                        <td className="px-4 py-3">
                                            <button onClick={() => handleOpenScreeningModal(notification)} className="flex items-center space-x-1 text-amber-400 hover:text-amber-300 font-semibold">
                                                <BrainCircuitIcon className="w-4 h-4" />
                                                <span>AI Draft</span>
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button onClick={() => onClearNotification(notification.id)} className="text-sky-400 hover:text-sky-300 font-semibold text-xs">Process/Clear</button>
                                        </td>
                                    </tr>
                                )
                           })}
                        </tbody>
                    </table>
                ) : <p className="text-slate-400 text-center py-4">No live notifications.</p>}
                </div>
            </Card>

            <Card title="Live Recipient Waitlist Management" titleIcon={<ListIcon className="text-slate-400"/>} accentColor="slate">
                <div className="max-h-96 overflow-y-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-900 sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Patient ID/Name</th>
                                <th className="px-4 py-3">Hospital (City)</th>
                                <th className="px-4 py-3">Organ/BG</th>
                                <th className="px-4 py-3">Urgency</th>
                                <th className="px-4 py-3">Score</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-slate-300">
                            {sortedRecipients.map(r => (
                                <tr key={r.id} className="border-b border-slate-700 hover:bg-slate-700/50">
                                    <td className="px-4 py-3">
                                        <div className="font-semibold">{r.name}</div>
                                        <div className="text-xs text-slate-500">{r.patientId}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{r.hospitalName?.split(',')[0]}</div>
                                        <div className="text-xs text-slate-400">{HOSPITALS.find(h=>h.mockId === r.hospitalId)?.city || ''}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                         <div className="font-medium">{r.organNeeded} ({r.bloodGroup})</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Select value={r.urgency} onChange={(e) => onUpdateRecipientUrgency(r.id, e.target.value as Urgency)} className="text-xs !p-1 !mt-0 bg-slate-700/80 border-slate-600 w-28">
                                            {URGENCY_LEVELS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </Select>
                                    </td>
                                    <td className="px-4 py-3 font-bold text-amber-400">{calculateScore(r)}</td>
                                    <td className="px-4 py-3 text-right">
                                        <button onClick={() => onDeleteRecipient(r.id)} className="text-rose-500 hover:text-rose-400 font-semibold text-xs">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
        
        <InfoModal
            isOpen={isUrgencyModalOpen}
            onClose={() => setIsUrgencyModalOpen(false)}
            title="Priority Patient Urgency Analysis"
            icon={<ZapIcon className="w-6 h-6" />}
            accentColor="amber"
        >
            {sortedRecipients.length > 0 && (() => {
                const patient = sortedRecipients[0];
                const organSupply = organSupplyDemand.find(o => o.organ === patient.organNeeded)?.supply || 0;
                return (
                    <>
                        <div className="bg-slate-900 p-3 rounded-md">
                            <h3 className="font-bold text-amber-400">Target Patient:</h3>
                            <p>Patient <span className="font-semibold text-white">{patient.name} ({patient.patientId})</span>, requiring <span className="font-semibold text-white">{patient.organNeeded}</span>. Highest priority score (<span className="font-semibold text-white">{calculateScore(patient)}</span>).</p>
                        </div>
                        <div className="bg-slate-900 p-3 rounded-md">
                            <h3 className="font-bold text-amber-400">Immediate Action Plan:</h3>
                            <ul className="list-disc list-inside space-y-1 mt-1 text-slate-400">
                                <li>Immediately verify the status and precise location of the single pledged kidney donor, initiating {patient.bloodGroup} blood group confirmation and preliminary HLA typing.</li>
                                <li>Alert the {patient.hospitalName} transplant coordination team in {HOSPITALS.find(h => h.mockId === patient.hospitalId)?.city} to prepare Patient {patient.patientId} for immediate admission and final cross-match testing procedures.</li>
                                <li>Mobilize priority logistics (potential Green Corridor) planning for organ retrieval and transport, prioritizing minimizing cold ischemic time given the critical single-unit supply.</li>
                            </ul>
                        </div>
                         <div className="bg-slate-900 p-3 rounded-md">
                            <h3 className="font-bold text-amber-400">Critical Constraint Summary:</h3>
                            <p>The current supply registry shows a match ({organSupply} {patient.organNeeded} pledged) for the required organ, however, the critical constraint is confirming {patient.bloodGroup} compatibility and securing a positive cross-match for Patient {patient.patientId} before the viability of the single available donor organ declines.</p>
                        </div>
                    </>
                );
            })()}
        </InfoModal>

        <InfoModal
            isOpen={isMatchModalOpen}
            onClose={() => setIsMatchModalOpen(false)}
            title={matchModalContent && matchModalContent.length > 0 ? `MATCH FOUND: ${matchModalContent[0].recipient.organNeeded} Transplant` : 'No Match Found'}
            icon={<HospitalIcon className="w-6 h-6" />}
            accentColor="indigo"
        >
            {matchModalContent && matchModalContent.length > 0 ? (
                matchModalContent.map((match, index) => (
                    <div key={index} className="bg-slate-900 p-3 rounded-md mb-2">
                        <p><strong className="text-slate-400">Recipient:</strong> {match.recipient.name} (ID: {match.recipient.patientId}, BG: {match.recipient.bloodGroup}, Hospital: {match.recipient.hospitalName})</p>
                        <p><strong className="text-slate-400">Donor:</strong> {match.donor.name} (BG: {match.donor.bloodGroup}, Organ: {match.recipient.organNeeded})</p>
                    </div>
                ))
            ) : (
                <p>No compatible donor-recipient pairs were found at this time. The system will continue to monitor for new pledges and requests.</p>
            )}
        </InfoModal>

        {screeningModalNotification && (() => {
            const donor = donors.find(d => d.id === screeningModalNotification.donorId);
            return (
                <InfoModal
                    isOpen={isScreeningModalOpen}
                    onClose={() => setIsScreeningModalOpen(false)}
                    title="Initial Donor Screening Report"
                    icon={<BrainCircuitIcon className="w-6 h-6" />}
                    accentColor="amber"
                >
                    {donor && (
                         <>
                            <div className="bg-slate-900 p-3 rounded-md">
                                <h3 className="font-bold text-amber-400">Initial Contact Draft:</h3>
                                <p className="italic text-slate-400">Dear {donor.name}, thank you for your compassionate interest in organ donation. We appreciate your registration. An Organ Coordinator will contact you shortly for the initial screening process.</p>
                            </div>
                            <div className="bg-slate-900 p-3 rounded-md">
                                <h3 className="font-bold text-amber-400">Eligibility & Risk Summary:</h3>
                                <p>Blood Group {donor.bloodGroup} is a common phenotype, offering a high potential recipient match pool. The pledged organ ({screeningModalNotification.organ}) is critically needed. Geographic proximity to major {donor.address.split(',').pop()?.trim() || 'N/A'} transplant centers is excellent. Prioritize initial HLA typing immediately due to high demand and regional fit.</p>
                            </div>
                            <p className="text-xs text-slate-500 text-center">Note: This is an AI-generated assessment. Full medical verification is mandatory.</p>
                        </>
                    )}
                </InfoModal>
            );
        })()}
        </>
    );
}

// --- CHATBOT COMPONENT ---
interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

const Chatbot: FC<{ onClose: () => void }> = ({ onClose }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', text: 'Hello! How can I help you with questions about organ donation in India?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isThinkingMode, setIsThinkingMode] = useState(false);
    const [isTtsEnabled, setIsTtsEnabled] = useState(true);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    
    // Audio Transcription state
    const [isListening, setIsListening] = useState(false);
    const liveSessionRef = useRef<any>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const aiRef = useRef<GoogleGenAI | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    const speakResponse = useCallback(async (text: string) => {
        if (!isTtsEnabled || !text || !aiRef.current) return;
        
        try {
            const response = await aiRef.current.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                },
            });

            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (base64Audio) {
                const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                const source = outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputAudioContext.destination);
                source.start();
            }
        } catch (error) {
            console.error("TTS Error:", error);
        }
    }, [isTtsEnabled]);

    const handleSendMessage = async (e: FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const newUserMessage: ChatMessage = { role: 'user', text: input };
        setMessages(prev => [...prev, newUserMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const model = isThinkingMode ? 'gemini-2.5-pro' : 'gemini-2.5-flash-lite';
            const config = isThinkingMode ? { thinkingConfig: { thinkingBudget: 32768 } } : {};
            
            const responseStream = await aiRef.current!.models.generateContentStream({
                model: model,
                contents: input,
                config: config,
            });

            let fullResponse = '';
            setMessages(prev => [...prev, { role: 'model', text: '' }]);

            for await (const chunk of responseStream) {
                const chunkText = chunk.text;
                if (chunkText) {
                    fullResponse += chunkText;
                    setMessages(prev => {
                        const newMessages = [...prev];
                        newMessages[newMessages.length - 1].text = fullResponse;
                        return newMessages;
                    });
                }
            }
            speakResponse(fullResponse);

        } catch (error) {
            console.error("Gemini API Error:", error);
            setMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Please try again.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleListen = async () => {
        if (isListening) {
            // Stop listening
            if (liveSessionRef.current) liveSessionRef.current.close();
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
            if (processorRef.current) processorRef.current.disconnect();
            if (audioContextRef.current) audioContextRef.current.close();

            liveSessionRef.current = null;
            streamRef.current = null;
            processorRef.current = null;
            audioContextRef.current = null;

            setIsListening(false);
            return;
        }

        // Start listening
        setIsListening(true);
        try {
            const sessionPromise = aiRef.current!.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: async () => {
                        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
                        const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
                        processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
                        
                        processorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createBlob(inputData);
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(processorRef.current);
                        processorRef.current.connect(audioContextRef.current.destination);
                    },
                    onmessage: (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription) {
                            const text = message.serverContent.inputTranscription.text;
                            setInput(prev => prev + text);
                        }
                    },
                    onerror: (e: ErrorEvent) => console.error('Live API Error:', e),
                    onclose: () => console.log('Live API connection closed.'),
                },
                config: { inputAudioTranscription: {} },
            });
            liveSessionRef.current = await sessionPromise;
        } catch (error) {
            console.error("Failed to start audio transcription:", error);
            setIsListening(false);
        }
    };

    return (
        <div className="fixed bottom-4 right-4 w-96 h-[600px] bg-slate-800 rounded-2xl shadow-2xl flex flex-col z-50 animate-fade-in border border-slate-700">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-700">
                 <div className="flex items-center space-x-2">
                    <BotMessageSquareIcon className="w-6 h-6 text-amber-400" />
                    <h3 className="font-bold text-white">NOTTO Info Assistant</h3>
                </div>
                 <div className="flex items-center space-x-1">
                    <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full">
                        <SettingsIcon className="w-5 h-5" />
                    </button>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full">
                        <XIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
            {/* Settings Dropdown */}
            {isSettingsOpen && (
                 <div className="absolute top-14 right-2 bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-lg w-56 z-10 animate-fade-in-sm space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-slate-300">Thinking Mode (Pro)</span>
                        <input type="checkbox" checked={isThinkingMode} onChange={e => setIsThinkingMode(e.target.checked)} className="form-checkbox h-4 w-4 rounded bg-slate-800 border-slate-600 text-indigo-500 focus:ring-indigo-500"/>
                    </label>
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-slate-300">Enable Speech (TTS)</span>
                        <input type="checkbox" checked={isTtsEnabled} onChange={e => setIsTtsEnabled(e.target.checked)} className="form-checkbox h-4 w-4 rounded bg-slate-800 border-slate-600 text-indigo-500 focus:ring-indigo-500"/>
                    </label>
                 </div>
            )}
            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs px-3 py-2 rounded-xl ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-slate-700 px-3 py-2 rounded-xl inline-flex items-center">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce mr-1"></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce mr-1 [animation-delay:0.1s]"></div>
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            {/* Input */}
            <div className="p-3 border-t border-slate-700">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                    <button type="button" onClick={handleListen} className={`p-2 rounded-full ${isListening ? 'text-rose-500 bg-rose-500/20 animate-pulse' : 'text-slate-400 hover:bg-slate-700'}`}>
                        <MicIcon className="w-5 h-5" />
                    </button>
                    <input 
                        type="text" 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        placeholder="Ask a question..." 
                        className="flex-1 bg-slate-700 border-slate-600 rounded-full px-4 py-2 text-sm text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <button type="submit" disabled={isLoading} className="p-2 bg-indigo-600 hover:bg-indigo-700 rounded-full text-white disabled:bg-slate-600">
                        <SendHorizonalIcon className="w-5 h-5" />
                    </button>
                </form>
            </div>
        </div>
    );
};


// --- MAIN APP COMPONENT ---

const App: FC = () => {
    const [page, setPage] = useState<Page>('donor');
    const [currentPage, setCurrentPage] = useState<Page>('donor');
    const [donors, setDonors] = useState<Donor[]>(() => getStoredData('donors', MOCK_DONORS));
    const [recipients, setRecipients] = useState<Recipient[]>(() => getStoredData('recipients', MOCK_RECIPIENTS));
    const [interestNotifications, setInterestNotifications] = useState<InterestNotification[]>(() => getStoredData('interestNotifications', []));
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => {
        setStoredData('donors', donors);
        setStoredData('recipients', recipients);
        setStoredData('interestNotifications', interestNotifications);
    }, [donors, recipients, interestNotifications]);


    const handleAddRecipient = (newRecipient: Recipient) => {
        setRecipients(prev => [newRecipient, ...prev]);
    };
    
    const handleAddMockRecipient = () => {
        const MOCK_NAMES = [
            'Aarav Sharma', 'Vivaan Singh', 'Aditya Kumar', 'Vihaan Gupta', 'Arjun Patel',
            'Sai Joshi', 'Reyansh Reddy', 'Ayaan Khan', 'Krishna Verma', 'Ishaan Ali',
            'Saanvi Sharma', 'Aanya Singh', 'Aadhya Gupta', 'Ananya Kumar', 'Pari Patel',
            'Diya Joshi', 'Myra Reddy', 'Aarohi Khan', 'Anika Verma', 'Riya Ali'
        ];

        const randomName = MOCK_NAMES[Math.floor(Math.random() * MOCK_NAMES.length)];
        const randomOrgan = ORGANS[Math.floor(Math.random() * ORGANS.length)];
        const randomBloodGroup = BLOOD_GROUPS[Math.floor(Math.random() * BLOOD_GROUPS.length)];
        const randomUrgency = URGENCY_LEVELS[Math.floor(Math.random() * URGENCY_LEVELS.length)];
        const randomHospital = HOSPITALS[Math.floor(Math.random() * HOSPITALS.length)];
        const randomId = Math.floor(1000 + Math.random() * 9000);

        const newRecipient: Recipient = {
            id: `r${Date.now()}`,
            patientId: `NOD-${randomId}`,
            name: randomName,
            organNeeded: randomOrgan,
            bloodGroup: randomBloodGroup,
            urgency: randomUrgency,
            timeOnList: Date.now() - Math.floor(Math.random() * 30) * (1000 * 60 * 60 * 24), // Random time in last 30 days
            hospitalId: randomHospital.mockId,
            hospitalName: randomHospital.name,
            clinicalNotes: 'Mock recipient added for simulation.',
            status: 'Searching',
        };
        
        setRecipients(prev => [newRecipient, ...prev]);
        alert(`Added mock recipient: ${randomName} needing a ${randomOrgan}.`);
    };

    const handleAddDonor = (newDonorData: Omit<Donor, 'id' | 'pledgeDate' | 'status'>) => {
        const newDonor: Donor = {
            ...newDonorData,
            id: `d${Date.now()}`,
            pledgeDate: Date.now(),
            status: 'Pledged',
        };
        setDonors(prev => [newDonor, ...prev]);
    };
    
    const handleWithdrawPledge = (donorId: string, organ: Organ) => {
        setDonors(prevDonors => {
            const newDonors = prevDonors.map(d => {
                if (d.id === donorId) {
                    const updatedPledgedOrgans = d.pledgedOrgans.filter(o => o !== organ);
                    return { ...d, pledgedOrgans: updatedPledgedOrgans };
                }
                return d;
            });
            // Filter out donors who have no organs left to pledge
            return newDonors.filter(d => d.pledgedOrgans.length > 0);
        });
    };
    
    const handleDonorInterest = (organ: Organ) => {
        const potentialDonor = donors.find(d => d.pledgedOrgans.includes(organ));

        if(potentialDonor) {
             const newNotification: InterestNotification = {
                id: `in${Date.now()}`,
                donorId: potentialDonor.id,
                organ,
                timestamp: Date.now()
            };
            setInterestNotifications(prev => [newNotification, ...prev]);
        } else {
             console.warn(`Interest shown for ${organ}, but no donor found with that pledge.`);
        }

        const urgencyOrder: Record<Urgency, number> = { 'Critical': 0, 'High': 1, 'Medium': 2 };
        
        const candidates = recipients
            .filter(r => r.organNeeded === organ && r.status === 'Searching')
            .sort((a, b) => {
                const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
                if (urgencyDiff !== 0) return urgencyDiff;
                return a.timeOnList - b.timeOnList;
            });

        if (candidates.length > 0) {
            const recipientToUpdate = candidates[0];
            setRecipients(prev => 
                prev.map(r => 
                    r.id === recipientToUpdate.id ? { ...r, status: 'Potential Match Found' } : r
                )
            );
        }
    };

    const handleClearNotification = (id: string) => {
        setInterestNotifications(prev => prev.filter(n => n.id !== id));
    };

    const handleUpdateRecipientUrgency = (id: string, urgency: Urgency) => {
        setRecipients(prev => prev.map(r => r.id === id ? {...r, urgency} : r));
    };
    
    const handleDeleteRecipient = (id: string) => {
        setRecipients(prev => prev.filter(r => r.id !== id));
    };
    
    const handleNavigate = (newPage: Page) => {
        if (currentPage === 'admin' && newPage !== 'admin') {
            setIsAdminAuthenticated(false);
        }
        setCurrentPage(newPage);
    };

    const renderContent = () => {
        switch (currentPage) {
            case 'donor':
                return <DonorView donors={donors} onAddDonor={handleAddDonor} onWithdrawPledge={handleWithdrawPledge} recipients={recipients} onDonorInterest={handleDonorInterest} onOpenChat={() => setIsChatOpen(true)} />;
            case 'waitlist':
                return <WaitlistView recipients={recipients} />;
            case 'hospital':
                return <HospitalView recipients={recipients} onAddRecipient={handleAddRecipient} />;
            case 'admin':
                return isAdminAuthenticated ? <AdminView 
                            donors={donors} 
                            recipients={recipients} 
                            notifications={interestNotifications}
                            onClearNotification={handleClearNotification}
                            onUpdateRecipientUrgency={handleUpdateRecipientUrgency}
                            onDeleteRecipient={handleDeleteRecipient}
                            onAddMockRecipient={handleAddMockRecipient}
                        /> : <AdminAuthView onAuthSuccess={() => setIsAdminAuthenticated(true)} />;
            default:
                return <div>Page not found</div>;
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white font-sans">
            <Header currentPage={currentPage} onNavigate={handleNavigate} />
            <main className="container mx-auto p-4 md:p-6">
                {renderContent()}
            </main>
            {isChatOpen && <Chatbot onClose={() => setIsChatOpen(false)} />}
        </div>
    );
};

export default App;
