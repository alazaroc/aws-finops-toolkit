#!/bin/bash

# AWS Lambda Log Review Tool
SCRIPT_TITLE="AWS Lambda Log Review"
REGION_TEST="us-east-1"
REGION_PROD="us-east-1"
LAMBDA_SUFFIX_TEST=""
LAMBDA_SUFFIX_PROD=""
LAMBDAS=(
    "finops-cost-analyzer"
    "finops-compliance-checker"
    "finops-tag-inventory"
    "finops-optimization-insights"
    "finops-historical-cost-analyzer"
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Help Function
show_help() {
    echo -e "${BLUE}=== ${SCRIPT_TITLE} ===${NC}"
    echo ""
    echo "Usage: $0 [minutes] [log_type] [environment] [profile] [save]"
    echo ""
    echo "Arguments:"
    echo "  1. minutes      : Time in minutes to look back (default: 30)"
    echo "  2. log_type     : 'errors' (only issues) or 'all' (full logs) (default: errors)"
    echo "  3. environment  : 'test', 'prod', or 'auto' (detects from profile) (default: auto)"
    echo "  4. profile      : AWS CLI profile name. Use \"\" or 'default' to use active credentials."
    echo "  5. save         : Type 'save' to export logs to a file."
    echo ""
    echo "Examples:"
    echo "  $0 --help                        # Show this help"
    echo "  $0 60                            # Check errors in last hour (auto env)"
    echo "  $0 60 all                        # See ALL logs for last hour"
    echo "  $0 60 errors prod                # Check PROD errors"
    echo "  $0 60 errors test my-profile     # Check TEST using specific profile"
    echo "  $0 60 errors auto \"\" save        # Save to file using current credentials"
    echo ""
}

# Check for help flag
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    show_help
    exit 0
fi

# Parameters
MINUTES=${1:-30}
LOG_TYPE=${2:-errors}
ENVIRONMENT=${3:-auto}
AWS_PROFILE_NAME=${4:-}
SAVE_TO_FILE=${5:-no}

# Env Detection
ACTIVE_PROFILE="${AWS_PROFILE_NAME:-${AWS_PROFILE:-${AWS_DEFAULT_PROFILE:-}}}"
if [[ "$ENVIRONMENT" == "auto" ]]; then
    case "$ACTIVE_PROFILE" in
        *prod*|*production*) ENVIRONMENT="prod" ;;
        *) ENVIRONMENT="test" ;;
    esac
fi
REGION=$([[ "$ENVIRONMENT" == "prod" ]] && echo "$REGION_PROD" || echo "$REGION_TEST")
LAMBDA_SUFFIX=$([[ "$ENVIRONMENT" == "prod" ]] && echo "$LAMBDA_SUFFIX_PROD" || echo "$LAMBDA_SUFFIX_TEST")
AWS_ARGS=(--region "$REGION")
[[ -n "$AWS_PROFILE_NAME" && "$AWS_PROFILE_NAME" != "default" ]] && AWS_ARGS+=(--profile "$AWS_PROFILE_NAME")

# Global Stats
GLOBAL_REQUESTS=0
GLOBAL_ERRORS=0
GLOBAL_WARNINGS=0

TEMP_SAVE_FILE=""
if [[ "$SAVE_TO_FILE" == "save" ]]; then
    TEMP_SAVE_FILE="logs_${ENVIRONMENT}_$(date +%Y%m%d_%H%M%S).log"
fi

output() {
    printf "%b\n" "$1"
    [[ -n "$TEMP_SAVE_FILE" ]] && printf "%b\n" "$1" | sed 's/\x1b\[[0-9;]*m//g' >> "$TEMP_SAVE_FILE"
}

get_start_time() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "$(( ($(date +%s) - MINUTES * 60) * 1000 ))"
    else
        date -u -d "$MINUTES minutes ago" +%s%3N 2>/dev/null || echo "$(( ($(date +%s) - MINUTES * 60) * 1000 ))"
    fi
}

process_lambda() {
    local base_name=$1
    local full_name="${base_name}${LAMBDA_SUFFIX}"
    local start_time=$(get_start_time)
    local local_errors=0
    local local_warnings=0

    output "${YELLOW}🔍 Checking: $full_name ($REGION)...${NC}"

    # Capture both stdout and stderr
    local tmp_err=$(mktemp)
    local raw_json=$(aws "${AWS_ARGS[@]}" logs filter-log-events \
        --log-group-name "/aws/lambda/$full_name" \
        --start-time "$start_time" \
        --query 'events[*].[timestamp,message]' \
        --output json 2>"$tmp_err")
    
    local aws_exit_code=$?
    local error_msg=$(cat "$tmp_err")
    rm "$tmp_err"

    # Check for AWS CLI errors
    if [[ $aws_exit_code -ne 0 || -n "$error_msg" ]]; then
        output "   ${RED}❌ AWS CLI Error:${NC}"
        output "   ${RED}$error_msg${NC}"
        
        # Check if it's a credential issue
        if [[ "$error_msg" == *"UnrecognizedClientException"* || "$error_msg" == *"security token"* || "$error_msg" == *"credentials"* ]]; then
            output ""
            output "   ${YELLOW}💡 Tip: Your AWS credentials may be expired. Try running:${NC}"
            output "   ${YELLOW}   aws sso login${NC}"
        fi
        return
    fi

    if [[ -z "$raw_json" || "$raw_json" == "[]" || "$raw_json" == "null" ]]; then
        if [[ "$LOG_TYPE" == "errors" ]]; then
            output "   ${GREEN}✅ No errors or warnings found.${NC}"
        else
            output "   ${GREEN}✅ No logs found in this time range.${NC}"
        fi
        return
    fi

    # Flatten JSON to a safe processing format (TS | MSG)
    local tmp_logs=$(mktemp)
    echo "$raw_json" | jq -r '.[] | "\(.[0])|SEP|\(.[1] | gsub("\n"; "__BR__"))"' > "$tmp_logs"

    local current_id=""
    local block_buffer=""
    local block_has_issue=0

    # Read logs line by line
    while IFS="|" read -r ts sep msg; do
        [[ -z "$msg" ]] && continue

        # Clean message early for filtering
        local clean_msg="${msg//__BR__/$'\n'}"

        # Skip isolated cold start lines (noise) BEFORE processing ID
        if [[ "$clean_msg" == *"INIT_START"* ]]; then
            continue
        fi
        
        # Extract ID (simple 36 char UUID)
        local line_id=$(echo "$msg" | grep -oE "[a-fA-F0-9-]{36}" | head -1)
        [[ -z "$line_id" ]] && line_id="system"

        # If ID changes, flush previous block
        if [[ "$line_id" != "$current_id" ]]; then
            if [[ "$LOG_TYPE" != "errors" || $block_has_issue -gt 0 ]]; then
                [[ -n "$block_buffer" ]] && output "\n$block_buffer"
            fi
            
            # Start new block
            current_id="$line_id"
            block_has_issue=0
            block_buffer="${BLUE}------------------------------------------------------------${NC}\n"
            block_buffer+="${BLUE}🚀 [ID] $line_id${NC}\n"
            block_buffer+="${BLUE}------------------------------------------------------------${NC}"
            GLOBAL_REQUESTS=$((GLOBAL_REQUESTS + 1))
        fi

        # Detection logic
        local is_error=0
        local is_warning=0
        local lower_msg=$(echo "$clean_msg" | tr '[:upper:]' '[:lower:]')
        
        if [[ "$lower_msg" == *"error"* || "$lower_msg" == *"failed"* || "$lower_msg" == *"exception"* || "$clean_msg" == *"❌"* ]]; then
            is_error=1
            block_has_issue=1
            ((local_errors++))
            ((GLOBAL_ERRORS++))
        elif [[ "$lower_msg" == *"warning"* || "$lower_msg" == *"warn"* || "$clean_msg" == *"⚠️"* ]]; then
            is_warning=1
            block_has_issue=1
            ((local_warnings++))
            ((GLOBAL_WARNINGS++))
        fi

        # Formatting
        local d="[??:??:??]"
        if [[ "$ts" =~ ^[0-9]+$ ]]; then
            d=$(date -r $((ts/1000)) "+%H:%M:%S" 2>/dev/null || date -d "@$((ts/1000))" "+%H:%M:%S" 2>/dev/null)
        fi

        local color=$NC
        [[ $is_error -eq 1 ]] && color=$RED
        [[ $is_warning -eq 1 ]] && color=$YELLOW
        [[ "$clean_msg" =~ (START|END|REPORT) ]] && color=$PURPLE

        # Add to buffer if it should be shown
        if [[ "$LOG_TYPE" != "errors" || $is_error -eq 1 || $is_warning -eq 1 ]]; then
            block_buffer+="\n${color}[$d] $clean_msg${NC}"
        fi


    done < "$tmp_logs"

    # Final flush
    if [[ "$LOG_TYPE" != "errors" || $block_has_issue -gt 0 ]]; then
        [[ -n "$block_buffer" ]] && output "\n$block_buffer"
    fi

    rm "$tmp_logs"

    if [[ "$LOG_TYPE" == "errors" && $local_errors -eq 0 && $local_warnings -eq 0 ]]; then
        output "   ${GREEN}✅ No errors or warnings found.${NC}"
    fi

    output ""
}

# START EXECUTION
clear
output "${BLUE}=== $SCRIPT_TITLE ===${NC}"
output "Config: ${GREEN}$MINUTES min${NC} | Region: ${GREEN}$REGION${NC} | Env: ${GREEN}$ENVIRONMENT${NC} | Type: ${GREEN}$LOG_TYPE${NC}"
if [[ "$SAVE_TO_FILE" == "save" ]]; then
    output "Saving: ${GREEN}Enabled ($TEMP_SAVE_FILE)${NC}"
else
    output "Saving: ${YELLOW}Disabled (console only)${NC}"
fi
output ""

for lambda in "${LAMBDAS[@]}"; do
    process_lambda "$lambda"
done

output ""
output "${BLUE}================ SUMMARY =================${NC}"
output "Total Unique Requests Analyzed: ${GREEN}$GLOBAL_REQUESTS${NC}"
output "Total Errors Found:             ${RED}$GLOBAL_ERRORS${NC}"
output "Total Warnings Found:           ${YELLOW}$GLOBAL_WARNINGS${NC}"
output "${BLUE}==========================================${NC}"
[[ -n "$TEMP_SAVE_FILE" ]] && echo -e "\n${GREEN}Export complete: ${YELLOW}$TEMP_SAVE_FILE${NC}"
