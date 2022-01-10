import React, { useMemo } from 'react'
import { SelectionMode, IColumn } from 'office-ui-fabric-react/lib/DetailsList'
import { Tooltip } from 'antd'
import { getValueFormat } from '@baurine/grafana-value-formats'
import { useTranslation } from 'react-i18next'
import { QuestionCircleOutlined } from '@ant-design/icons'

import { Bar, TextWrap, CardTable } from '@lib/components'
import { TopsqlSummaryPlanItem } from '@lib/client'

import type { SQLRecord } from '../ListTable'
import { ListDetailContent } from './ListDetailContent'
import { useRecordSelection } from '../../../utils/useRecordSelection'
import {
  convertNoPlanRecord,
  createOverallRecord,
  isNoPlanRecord,
  isOverallRecord,
} from '@lib/apps/TopSQL/utils/specialRecord'

export type InstanceType = 'tidb' | 'tikv'

interface ListDetailTableProps {
  record: SQLRecord
  capacity: number
  instanceType: InstanceType
}

const UNKNOWN_LABEL = 'Unknown'

const shortFormat = (v: number = 0) => {
  return getValueFormat('short')(v, 1)
}
const fixedFormat = (v: number = 0) => {
  return getValueFormat('none')(v, 1)
}
const msFormat = (v: number = 0) => {
  return getValueFormat('ms')(v, 1)
}

export function ListDetailTable({
  record: sqlRecord,
  capacity,
  instanceType,
}: ListDetailTableProps) {
  const { records: planRecords, isMultiPlans } = usePlanRecord(sqlRecord)
  const { t } = useTranslation()

  const tableColumns = useMemo(
    () =>
      [
        {
          name: t('topsql.detail.fields.cpu_time'),
          key: 'cpuTime',
          minWidth: 150,
          maxWidth: 250,
          onRender: (rec: PlanRecord) => (
            <Bar textWidth={80} value={rec.cpuTime!} capacity={capacity}>
              {getValueFormat('ms')(rec.cpuTime, 2)}
            </Bar>
          ),
        },
        {
          name: t('topsql.detail.fields.plan'),
          key: 'plan',
          minWidth: 150,
          maxWidth: 150,
          onRender: (rec: PlanRecord) => {
            return isOverallRecord(rec) ? (
              <Tooltip
                title={t('topsql.detail.overall_tooltip')}
                placement="right"
              >
                <span
                  style={{
                    verticalAlign: 'middle',
                    fontStyle: 'italic',
                    color: '#aaa',
                  }}
                >
                  {t('topsql.detail.overall')} <QuestionCircleOutlined />
                </span>
              </Tooltip>
            ) : isNoPlanRecord(rec) ? (
              <Tooltip
                title={t('topsql.detail.no_plan_tooltip')}
                placement="right"
              >
                <span
                  style={{
                    verticalAlign: 'middle',
                    fontStyle: 'italic',
                    color: '#aaa',
                  }}
                >
                  {t('topsql.detail.no_plan')} <QuestionCircleOutlined />
                </span>
              </Tooltip>
            ) : (
              <Tooltip title={rec.plan_digest} placement="right">
                <TextWrap style={{ width: '80px' }}>
                  {rec.plan_digest || UNKNOWN_LABEL}
                </TextWrap>
              </Tooltip>
            )
          },
        },
        {
          name: t('topsql.detail.fields.exec_count_per_sec'),
          key: 'exec_count_per_sec',
          minWidth: 50,
          maxWidth: 150,
          onRender: (rec: PlanRecord) => (
            <Tooltip title={fixedFormat(rec.exec_count_per_sec)}>
              <TextWrap>{shortFormat(rec.exec_count_per_sec)}</TextWrap>
            </Tooltip>
          ),
        },
        instanceType === 'tikv' && {
          name: t('topsql.detail.fields.scan_records_per_sec'),
          key: 'scan_records_per_sec',
          minWidth: 50,
          maxWidth: 150,
          onRender: (rec: PlanRecord) => (
            <Tooltip title={fixedFormat(rec.scan_records_per_sec)}>
              <TextWrap>{shortFormat(rec.scan_records_per_sec)}</TextWrap>
            </Tooltip>
          ),
        },
        instanceType === 'tikv' && {
          name: t('topsql.detail.fields.scan_indexes_per_sec'),
          key: 'scan_indexes_per_sec',
          minWidth: 50,
          maxWidth: 150,
          onRender: (rec: PlanRecord) => (
            <Tooltip title={fixedFormat(rec.scan_indexes_per_sec)}>
              <TextWrap>{shortFormat(rec.scan_indexes_per_sec)}</TextWrap>
            </Tooltip>
          ),
        },
        instanceType === 'tidb' && {
          name: t('topsql.detail.fields.duration_per_exec_ms'),
          key: 'latency',
          minWidth: 50,
          maxWidth: 150,
          onRender: (rec: PlanRecord) => (
            <Tooltip title={msFormat(rec.duration_per_exec_ms)}>
              <TextWrap>{msFormat(rec.duration_per_exec_ms)}</TextWrap>
            </Tooltip>
          ),
        },
      ].filter((c) => !!c) as IColumn[],
    [capacity, instanceType]
  )

  const { selectedRecord, selection } = useRecordSelection<PlanRecord>({
    storageKey: 'topsql.list_detail_table_selected_key',
    selections: planRecords,
    getKey: (r) => r.plan_digest!,
    canSelectItem: (r) => !isNoPlanRecord(r) && !isOverallRecord(r),
  })

  const planRecord = useMemo(() => {
    if (isMultiPlans) {
      return selectedRecord
    }

    return planRecords[0]
  }, [planRecords, isMultiPlans, selectedRecord])

  return (
    <>
      <CardTable
        cardNoMarginTop
        getKey={(r: PlanRecord) => r?.plan_digest!}
        items={planRecords}
        columns={tableColumns}
        selectionMode={SelectionMode.single}
        selectionPreservedOnEmptyClick
        onRowClicked={() => {}}
        selection={selection}
      />
      {!sqlRecord.is_other && (
        <ListDetailContent sqlRecord={sqlRecord} planRecord={planRecord} />
      )}
    </>
  )
}

export type PlanRecord = {
  cpuTime: number
} & TopsqlSummaryPlanItem

const usePlanRecord = (
  record: SQLRecord
): { isMultiPlans: boolean; records: PlanRecord[] } => {
  return useMemo(() => {
    if (!record?.plans?.length) {
      return { isMultiPlans: false, records: [] }
    }

    const isMultiPlans = record.plans.length > 1
    const plans = [...record.plans]

    const records: PlanRecord[] = plans
      .map((p) => {
        const cpuTime = p.cpu_time_ms?.reduce((pt, t) => pt + t, 0) || 0
        return {
          ...p,
          cpuTime,
        }
      })
      .sort((a, b) => b.cpuTime - a.cpuTime)
      .map(convertNoPlanRecord)

    // add overall record to the first
    if (isMultiPlans) {
      records.unshift(createOverallRecord(record))
    }

    return { isMultiPlans, records }
  }, [record])
}